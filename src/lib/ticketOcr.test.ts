import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../types/db'
import { detectSupermarket, parseTicketText } from './ticketOcr'

function mkIng(id: number, name: string, category_id: number | null = null): Ingredient {
  return {
    id,
    name,
    category_id,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    default_unit: 'g',
    grams_per_unit: null,
    estimated_price_per_100g: null,
    typically_frozen: false,
  }
}

const INGREDIENTS = [
  mkIng(1, 'leche', 10),
  mkIng(2, 'pechuga de pollo', 20),
  mkIng(3, 'plátano', 30),
  mkIng(4, 'aceite de oliva'),
  mkIng(5, 'yogur natural', 10),
]
const CATEGORIES = new Map([
  [10, 'Huevos y lácteos'],
  [20, 'Carnes'],
  [30, 'Frutas'],
])

const byName = (r: ReturnType<typeof parseTicketText>, name: string) =>
  r.items.find((i) => i.name === name)

describe('detectSupermarket', () => {
  it('detecta las tres cadenas por la cabecera', () => {
    expect(detectSupermarket('MERCADONA S.A.\nC/ MAYOR 1\n')).toBe('mercadona')
    expect(detectSupermarket('LIDL SUPERMERCADOS S.A.U.\nAVDA SUR\n')).toBe('lidl')
    expect(detectSupermarket('DIA RETAIL ESPAÑA S.A.\nCALLE LUNA 2\n')).toBe('dia')
  })

  it('devuelve null si no reconoce la cadena (y no confunde "medias")', () => {
    expect(detectSupermarket('SUPERMERCADOS PACO\nBienvenido\n')).toBeNull()
    expect(detectSupermarket('TIENDA DE MEDIAS Y CALCETINES\n')).toBeNull()
  })
})

describe('parseTicketText — genérico (Día)', () => {
  const TICKET = `DIA RETAIL ESPAÑA S.A.
CALLE LUNA 2
LECHE ENTERA BRIK 0,89
ACEITE DE OLIVA VIRGEN 5,49
TOTAL 6,38
TARJETA 6,38`

  it('extrae precio por línea y supermercado', () => {
    const r = parseTicketText(TICKET, INGREDIENTS, CATEGORIES)
    expect(r.supermarket_slug).toBe('dia')
    expect(r.total).toBe(6.38)
    expect(byName(r, 'leche')).toMatchObject({ ingredient_id: 1, price: 0.89 })
    expect(byName(r, 'aceite de oliva')).toMatchObject({ ingredient_id: 4, price: 5.49 })
  })
})

describe('parseTicketText — Mercadona', () => {
  const TICKET = `MERCADONA S.A.
AVDA. DE ANDALUCIA S/N
2 LECHE ENTERA 1,05 2,10
PLATANO
0,756 kg 2,29 €/kg 1,73
1 YOGUR NATURAL PACK 1,80
TOTAL 5,63`

  it('cantidad delante: precio unitario, no total de línea', () => {
    const r = parseTicketText(TICKET, INGREDIENTS, CATEGORIES)
    expect(r.supermarket_slug).toBe('mercadona')
    expect(byName(r, 'leche')).toMatchObject({ price: 1.05, quantity: 2, unit: 'ud' })
  })

  it('pesados: nombre en una línea y "kg €/kg total" en la siguiente', () => {
    const r = parseTicketText(TICKET, INGREDIENTS, CATEGORIES)
    expect(byName(r, 'plátano')).toMatchObject({
      ingredient_id: 3,
      price: 1.73,
      quantity: 0.756,
      unit: 'kg',
    })
  })

  it('cantidad 1 no altera el precio', () => {
    const r = parseTicketText(TICKET, INGREDIENTS, CATEGORIES)
    expect(byName(r, 'yogur natural')).toMatchObject({ price: 1.8, quantity: null })
  })
})

describe('parseTicketText — Lidl', () => {
  const TICKET = `LIDL SUPERMERCADOS S.A.U.
PECHUGA DE POLLO 4,15 A
LECHE ENTERA 0,99 A
Dto. leche -0,20
TOTAL 4,94`

  it('ignora líneas de descuento en negativo', () => {
    const r = parseTicketText(TICKET, INGREDIENTS, CATEGORIES)
    expect(r.supermarket_slug).toBe('lidl')
    expect(r.items).toHaveLength(2)
    expect(byName(r, 'pechuga de pollo')).toMatchObject({ price: 4.15 })
    expect(byName(r, 'leche')).toMatchObject({ price: 0.99 })
  })

  it('la letra de IVA tras el precio no rompe el importe', () => {
    const r = parseTicketText(TICKET, INGREDIENTS, CATEGORIES)
    expect(r.total).toBe(4.94)
  })
})

describe('parseTicketText — robustez', () => {
  it('líneas sin precio ni pesado siguiente se descartan', () => {
    const r = parseTicketText('DIA\nGRACIAS POR SU VISITA\nCOSA SUELTA\n', INGREDIENTS, CATEGORIES)
    expect(r.items).toHaveLength(0)
  })

  it('caducidad estimada por pasillo del ingrediente emparejado', () => {
    const r = parseTicketText('DIA\nPECHUGA DE POLLO FRESCA 3,99\n', INGREDIENTS, CATEGORIES)
    expect(byName(r, 'pechuga de pollo')).toMatchObject({
      perishable: true,
      days_to_expiry_guess: 3,
    })
  })
})
