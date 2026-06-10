// Edge Function: extrae los productos y el total de una foto de ticket de súper
// con Claude (visión + structured outputs). El cliente decide qué insertar.
// Secret necesario: ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...)

import Anthropic from 'npm:@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

const TICKET_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Nombre del producto en minúsculas, genérico y sin marca (ej. "leche", "pechuga de pollo", "tomate"). Une líneas duplicadas.',
          },
          perishable: {
            type: 'boolean',
            description: 'true si es fresco/refrigerado y caduca en días (carne, pescado, lácteo, verdura, fruta)',
          },
          days_to_expiry_guess: {
            type: ['integer', 'null'],
            description: 'Días típicos hasta caducar si perishable; null si no aplica',
          },
        },
        required: ['name', 'perishable', 'days_to_expiry_guess'],
        additionalProperties: false,
      },
    },
    total: {
      type: ['number', 'null'],
      description: 'Importe total del ticket en euros; null si no se distingue',
    },
  },
  required: ['items', 'total'],
  additionalProperties: false,
} as const

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 })
  }
  const { image, media_type } = (await req.json().catch(() => ({}))) as {
    image?: string
    media_type?: string
  }
  if (!image) {
    return new Response(JSON.stringify({ error: 'falta image (base64)' }), { status: 400 })
  }

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: TICKET_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: (media_type ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
                data: image,
              },
            },
            {
              type: 'text',
              text: 'Es la foto de un ticket de supermercado español (Día, Lidl o similar). Extrae los productos comprados (nombres genéricos, sin marcas, agrupando duplicados) y el importe total. Ignora bolsas, depósitos y descuentos como productos.',
            },
          ],
        },
      ],
    })

    const text = response.content.find((b) => b.type === 'text')
    return new Response(text && 'text' in text ? text.text : '{"items":[],"total":null}', {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
