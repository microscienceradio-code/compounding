/** yyyy-mm-dd for a Date, in local time (no UTC shifting surprises). */
export function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayString(): string {
  return toDateString(new Date())
}

/** Monday of the week containing `date` (ISO week start), as yyyy-mm-dd. */
export function weekStartOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay() // 0 = Sunday ... 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diffToMonday)
  d.setHours(0, 0, 0, 0)
  return toDateString(d)
}

export function currentWeekStart(): string {
  return weekStartOf(new Date())
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateString(d)
}

export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function lastNDates(n: number): string[] {
  const out: string[] = []
  const today = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    out.push(toDateString(d))
  }
  return out
}

export function lastNWeekStarts(n: number): string[] {
  const out: string[] = []
  const current = new Date(currentWeekStart() + 'T00:00:00')
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(current)
    d.setDate(d.getDate() - i * 7)
    out.push(toDateString(d))
  }
  return out
}
