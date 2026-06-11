// Escaneo de tickets 100% local: OCR con Tesseract (WASM, en el dispositivo)
// + parser heurístico de tickets españoles. Sin proveedores externos.
// El modelo de idioma (~2 MB) se descarga la primera vez y queda cacheado por
// el service worker: a partir de ahí funciona sin internet.

import type { Ingredient } from '../types/db'

export type SupermarketSlug = 'dia' | 'lidl' | 'mercadona'

export interface TicketItem {
  name: string
  perishable: boolean
  days_to_expiry_guess: number | null
  ingredient_id: number | null
  price: number | null // € por unidad de compra (envase), derivado de la línea
  quantity: number | null // cantidad si la línea la trae (ej. 0.456 kg, 2 ud)
  unit: string | null // unidad de esa cantidad ('kg', 'ud'...)
}

export interface TicketResult {
  items: TicketItem[]
  total: number | null
  supermarket_slug: SupermarketSlug | null // cadena detectada en la cabecera
}

// Líneas que no son productos (cabeceras, pagos, impuestos...)
// \biva\b y no "iva" a secas: si no, se come "OLIVA" (aceite de oliva...)
const SKIP =
  /total|tarjeta|efectivo|cambio|entrega|devoluc|\biva\b|base imponible|cuota|d(es)?c(uen)?to|bolsa|ticket|factura|n\.?i\.?f|c\.?i\.?f|gracias|visita|www\.|tel[eé]f|caja|operador|venta|importe|cliente|cop[ií]a|^\s*\d{1,2}[:/.]\d{2}/i

const PRICE = /(\d{1,4}[.,]\d{2})\s*[€e]?\s*[a-z*]?\s*$/i

/** Días típicos hasta caducar según el pasillo del ingrediente emparejado. */
const PERISHABLE_DAYS: Record<string, number> = {
  'Pescados y mariscos': 2,
  Carnes: 3,
  'Verduras y hortalizas': 5,
  Frutas: 5,
  'Huevos y lácteos': 7,
  'Platos preparados': 4,
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'en', 'con', 'y', 'al'])

/** Empareja el texto de una línea con un ingrediente del catálogo (todas sus palabras presentes). */
function matchIngredient(lineText: string, ingredients: Ingredient[]): Ingredient | null {
  const line = normalize(lineText)
  let best: Ingredient | null = null
  for (const ing of ingredients) {
    const words = normalize(ing.name)
      .split(/\s+/)
      .filter((w) => !STOPWORDS.has(w))
    if (words.length && words.every((w) => line.includes(w))) {
      if (!best || ing.name.length > best.name.length) best = ing
    }
  }
  return best
}

function parsePrice(raw: string): number {
  return Number(raw.replace(',', '.'))
}

/** Detecta la cadena por las primeras líneas del ticket (cabecera). */
export function detectSupermarket(text: string): SupermarketSlug | null {
  const head = normalize(text.split('\n').slice(0, 15).join(' '))
  if (/mercadona/.test(head)) return 'mercadona'
  if (/lidl/.test(head)) return 'lidl'
  if (/\bdia\b|grupo dia|dia retail/.test(head)) return 'dia'
  return null
}

// Línea de pesado (Mercadona la pone DEBAJO del nombre): "0,456 kg 2,30 €/kg 1,05"
const WEIGHED = /^\s*(\d+[.,]\d+)\s*kg\b.*?(\d{1,4}[.,]\d{2})\s*[€e]?\s*\/?\s*kg/i
const ALL_PRICES = /\d{1,4}[.,]\d{2}/g
// Descuentos/abonos (Lidl los lista como línea propia en negativo)
const NEGATIVE = /-\s*\d{1,4}[.,]\d{2}\s*[€e]?\s*[a-z*]?\s*$/i

export function parseTicketText(
  text: string,
  ingredients: Ingredient[],
  categoryNameById: Map<number, string>,
): TicketResult {
  const items: TicketItem[] = []
  const seen = new Set<string>()
  let total: number | null = null
  const supermarket_slug = detectSupermarket(text)

  const lines = text.split('\n')
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim()
    if (line.length < 3) continue

    // total: nos quedamos con el importe más alto de las líneas "total"
    if (/total/i.test(line)) {
      const m = line.match(PRICE)
      if (m) {
        const value = parsePrice(m[1])
        if (total === null || value > total) total = value
      }
      continue
    }
    if (SKIP.test(line)) continue
    if (NEGATIVE.test(line)) continue // descuento/abono, no es un producto

    let priceLine = line
    let quantity: number | null = null
    let unit: string | null = null

    if (!PRICE.test(line)) {
      // Mercadona (pesados): nombre sin precio + línea siguiente "0,456 kg ... €/kg ... 1,05"
      const next = lines[li + 1]?.trim() ?? ''
      const weighed = next.match(WEIGHED)
      if (!weighed || !PRICE.test(next)) continue // las líneas de producto acaban en precio
      priceLine = next
      quantity = parsePrice(weighed[1])
      unit = 'kg'
      li++ // consumida la línea de pesado
    }

    // nombre = línea sin cantidades iniciales tipo "2 x" o "0,456 kg" (las
    // unidades exigen \b para no comerse la L de "LECHE") y cortada en el
    // primer importe (un "2 LECHE 1,05 2,10" deja solo "LECHE")
    const qtyPrefix = line.match(/^\s*(\d{1,3})(?:\s*x)?\s+/i)
    const stripped = line
      .replace(/^\s*\d+([.,]\d+)?\s*(x\s*|kg\b|g\b|l\b|ud[s.]?\b)?\s*/i, '')
      .replace(/\s{2,}/g, ' ')
    const firstPrice = stripped.search(/\d{1,4}[.,]\d{2}/)
    const name = (firstPrice >= 0 ? stripped.slice(0, firstPrice) : stripped).trim()
    if (name.length < 3 || /^\d+$/.test(name)) continue

    // precio por unidad de compra: el último importe de la línea es el total
    // de línea; con cantidad N delante (estilo Mercadona "2 LECHE 1,50 3,00"),
    // el penúltimo es el unitario si cuadra, si no total/N.
    const linePrices = (priceLine.match(ALL_PRICES) ?? []).map(parsePrice)
    const lineTotal = linePrices.at(-1) ?? null
    let price = lineTotal
    if (quantity === null && qtyPrefix && lineTotal !== null) {
      const n = Number(qtyPrefix[1])
      if (n > 1) {
        quantity = n
        unit = 'ud'
        const unitCandidate = linePrices.at(-2)
        price =
          unitCandidate !== undefined && Math.abs(unitCandidate * n - lineTotal) < 0.02
            ? unitCandidate
            : Math.round((lineTotal / n) * 100) / 100
      }
    }

    const matched = matchIngredient(name, ingredients)
    const displayName = (matched?.name ?? name.toLowerCase()).trim()
    if (seen.has(displayName)) continue
    seen.add(displayName)

    const category = matched?.category_id ? categoryNameById.get(matched.category_id) : undefined
    const days = category ? (PERISHABLE_DAYS[category] ?? null) : null
    items.push({
      name: displayName,
      perishable: days !== null,
      days_to_expiry_guess: days,
      ingredient_id: matched?.id ?? null,
      price,
      quantity,
      unit,
    })
  }

  return { items, total, supermarket_slug }
}

/** OCR en el dispositivo (tesseract.js, importado bajo demanda) + parser. */
export async function scanTicketLocally(
  file: File,
  ingredients: Ingredient[],
  categoryNameById: Map<number, string>,
  onProgress?: (pct: number) => void,
): Promise<TicketResult> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(m.progress * 100))
    },
  })
  try {
    const { data } = await worker.recognize(file)
    return parseTicketText(data.text, ingredients, categoryNameById)
  } finally {
    await worker.terminate()
  }
}
