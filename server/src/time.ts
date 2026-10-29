// Day boundaries in the user's own timezone (IANA name), DST-correct via Intl.
export function tzOffsetMs(tz: string, ms: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return asUtc - Math.floor(ms / 1000) * 1000
}
export const localDay = (ms: number, tz: string) => new Date(ms + tzOffsetMs(tz, ms)).toISOString().slice(0, 10)
export const localHour = (ms: number, tz: string) => new Date(ms + tzOffsetMs(tz, ms)).getUTCHours()
export const stamp = (ms: number, tz: string) => new Date(ms + tzOffsetMs(tz, ms)).toISOString().slice(0, 16).replace('T', ' ')
// ponytail: offset taken at UTC midnight of that date; off by an hour only on DST-switch nights.
export const dayStart = (day: string, tz: string) => {
  const utc = Date.parse(`${day}T00:00:00Z`)
  return utc - tzOffsetMs(tz, utc)
}
export const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
