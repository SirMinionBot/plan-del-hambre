// Semana con lunes como primer día, fechas como YYYY-MM-DD locales.

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

export function weekDates(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return toISODate(d)
  })
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function isWeekend(iso: string): boolean {
  const day = new Date(iso + 'T00:00:00').getDay()
  return day === 0 || day === 6
}

export function dayLabel(iso: string): string {
  return new Date(iso + 'T00:00:00')
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
    .toUpperCase()
}

export function currentSeason(date: Date): 'primavera' | 'verano' | 'otono' | 'invierno' {
  const m = date.getMonth() + 1
  if (m >= 3 && m <= 5) return 'primavera'
  if (m >= 6 && m <= 8) return 'verano'
  if (m >= 9 && m <= 11) return 'otono'
  return 'invierno'
}
