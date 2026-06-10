// Escaneo de tickets 100% local: OCR con Tesseract (WASM, en el dispositivo)
// + parser heurístico de tickets españoles. Sin proveedores externos.
// El modelo de idioma (~2 MB) se descarga la primera vez y queda cacheado por
// el service worker: a partir de ahí funciona sin internet.

import type { Ingredient } from '../types/db'

export interface TicketItem {
  name: string
  perishable: boolean
  days_to_expiry_guess: number | null
  ingredient_id: number | null
}

export interface TicketResult {
  items: TicketItem[]
  total: number | null
}

// Líneas que no son productos (cabeceras, pagos, impuestos...)
const SKIP =
  /total|tarjeta|efectivo|cambio|entrega|devoluc|iva|base imponible|cuota|d(es)?c(uen)?to|bolsa|ticket|factura|n\.?i\.?f|c\.?i\.?f|gracias|visita|www\.|tel[eé]f|caja|operador|venta|importe|cliente|cop[ií]a|^\s*\d{1,2}[:/.]\d{2}/i

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

export function parseTicketText(
  text: string,
  ingredients: Ingredient[],
  categoryNameById: Map<number, string>,
): TicketResult {
  const items: TicketItem[] = []
  const seen = new Set<string>()
  let total: number | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
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

    const priceMatch = line.match(PRICE)
    if (!priceMatch) continue // las líneas de producto acaban en precio

    // nombre = línea sin el precio final, sin cantidades iniciales tipo "2 x" o "0,456 kg"
    const name = line
      .slice(0, priceMatch.index)
      .replace(/^\s*\d+([.,]\d+)?\s*(x|kg|g|l|ud[s.]?)?\s*/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (name.length < 3 || /^\d+$/.test(name)) continue

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
    })
  }

  return { items, total }
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
