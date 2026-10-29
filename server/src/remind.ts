// Dates heard in conversation ("our anniversary is November 2nd") and promise due dates → the reminders the
// iPhone schedules as local notifications. Pure date math on plain YYYY-MM-DD days in the user's timezone;
// the phone turns each `at` (local wall-clock time) into a notification, so no timezone math happens here.

export type MomentInput = {
  kind: string; title: string; person: string | null; date: string; time: string | null; yearly: boolean; prep: string | null; lead_days: number[]
}
export type Moment = Omit<MomentInput, 'yearly' | 'lead_days'> & { id: string; yearly: number; lead_days: string; ideas: string | null; ideas_for: string | null }
export type DueAction = { id: string; owner: string; counterpart: string | null; what: string; due_date: string; created_day: string }
export type Reminder = { id: string; at: string; title: string; body: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const KINDS = ['birthday', 'anniversary', 'event', 'trip', 'deadline', 'appointment', 'other']

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Whatever the model said → a valid moment, or null when there's no clear day. */
export function cleanMoment(m: Partial<Record<keyof MomentInput, unknown>> | null | undefined): MomentInput | null {
  const date = String(m?.date ?? '')
  if (!DAY.test(date) || Number.isNaN(Date.parse(date)) || !m?.title) return null
  const time = typeof m.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time) ? m.time : null
  const leads = (Array.isArray(m.lead_days) ? m.lead_days : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60)
  return {
    kind: KINDS.includes(String(m.kind)) ? String(m.kind) : 'other',
    title: String(m.title).slice(0, 120),
    person: m.person ? String(m.person).slice(0, 60) : null,
    date,
    time,
    yearly: m.yearly === true,
    prep: m.prep ? String(m.prep).slice(0, 160) : null,
    lead_days: leads.length ? [...new Set(leads)].sort((a, b) => b - a).slice(0, 4) : [time ? 0 : 1],
  }
}

/** Same thing heard twice (the anniversary comes up in three conversations) → one reminder. */
export const dedupeKey = (m: MomentInput) => `${m.kind}|${m.yearly ? m.date.slice(5) : m.date}|${(m.person ?? m.title).toLowerCase().split(' ')[0]}`

/** The next time a moment happens on or after `today`; yearly ones roll over, Feb 29 falls on Feb 28. */
export function nextOccurrence(m: { date: string; yearly: number | boolean }, today: string): string | null {
  if (!m.yearly) return m.date >= today ? m.date : null
  const md = m.date.slice(5)
  for (const y of [+today.slice(0, 4), +today.slice(0, 4) + 1]) {
    const leap = new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1
    const d = `${y}-${md === '02-29' && !leap ? '02-28' : md}`
    if (d >= today) return d
  }
  return null
}

const when = (n: number) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === 7 ? 'In a week' : n === 14 ? 'In two weeks' : `In ${n} days`)

/** Every reminder from `today` to `today + horizon` days, soonest first. */
export function reminders(moments: Moment[], actions: DueAction[], today: string, horizon = 45): Reminder[] {
  const last = addDays(today, horizon)
  const out: Reminder[] = []
  for (const m of moments) {
    const occ = nextOccurrence(m, today)
    if (!occ) continue
    for (const n of JSON.parse(m.lead_days) as number[]) {
      const day = addDays(occ, -n)
      if (day < today || day > last) continue
      const ideas = n >= 3 && m.ideas_for === occ ? m.ideas : null
      const body = [m.prep && `${cap(m.prep)}${n === 0 ? ' if you haven’t.' : '.'}`, ideas].filter(Boolean).join(' ')
      out.push({
        id: `m:${m.id}:${occ}:${n}`,
        at: `${day}T${n === 0 ? (m.time ?? '08:00') : '09:00'}`,
        title: `${when(n)}: ${m.title}${n >= 2 ? ` (${weekday(occ)})` : ''}`,
        body: body || (n === 0 && m.time ? `At ${m.time}.` : 'Heard in conversation.'),
      })
    }
  }
  for (const a of actions) {
    if (a.owner === 'you') {
      const to = a.counterpart ? ` for ${a.counterpart}` : ''
      // the evening-before nudge only when the promise was made before then
      if (addDays(a.due_date, -1) > a.created_day)
        out.push({ id: `a:${a.id}:1`, at: `${addDays(a.due_date, -1)}T09:00`, title: `Due tomorrow: ${a.what}`, body: `You promised this${to}. A follow-up draft is ready in Earshot.` })
      out.push({ id: `a:${a.id}:0`, at: `${a.due_date}T09:00`, title: `Due today: ${a.what}`, body: `You promised this${to}.` })
    } else {
      out.push({ id: `a:${a.id}:check`, at: `${addDays(a.due_date, 1)}T10:00`, title: `Check in with ${a.owner}`, body: `${a.owner} said they’d ${a.what} by ${weekday(a.due_date)}.` })
    }
  }
  return out.filter((r) => r.at.slice(0, 10) >= today && r.at.slice(0, 10) <= last).sort((a, b) => a.at.localeCompare(b.at))
}

// Routines ("every Friday at 5, what do I still owe people?") and place reminders ("when I'm at a grocery store").
// A routine without a question repeats on the phone by itself; one with a question gets a fresh answer
// written before each run. Places are resolved to coordinates on the phone: location never reaches the server.
export type RoutineInput = { title: string; days: string[]; time: string; question: string | null }
export type PlaceInput = { title: string; place: string; leave: boolean }
export type Routine = { id: string; title: string; days: string; time: string; question: string | null; answer: string | null; answer_for: string | null }

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function cleanRoutine(r: Partial<Record<keyof RoutineInput, unknown>> | null | undefined): RoutineInput | null {
  if (!r?.title || typeof r.time !== 'string' || !TIME.test(r.time)) return null
  const days = (Array.isArray(r.days) ? r.days : []).map((d) => String(d).slice(0, 3).toLowerCase()).filter((d) => DAYS.includes(d))
  const set = [...new Set(days)]
  return { title: cap(String(r.title).slice(0, 120)), days: set.length === 7 ? [] : set, time: r.time, question: r.question ? String(r.question).slice(0, 300) : null }
}

/** "the office" → "work", "my place" → "home": the two places the phone only knows once you pin them. */
export function normPlace(p: string): string {
  const s = p.trim().toLowerCase().replace(/^(the|my|our) /, '')
  if (/^(office|work|workplace)$/.test(s)) return 'work'
  if (/^(home|house|place|apartment|flat)$/.test(s)) return 'home'
  return p.trim().slice(0, 80)
}

export function cleanPlace(p: Partial<Record<keyof PlaceInput, unknown>> | null | undefined): PlaceInput | null {
  if (!p?.title || !p.place) return null
  return { title: cap(String(p.title).slice(0, 120)), place: normPlace(String(p.place)), leave: p.leave === true }
}

const dayName = (d: string) => ({ sun: 'Sundays', mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays' })[d]
const clock = (t: string) => new Date(`2000-01-01T${t}:00Z`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** What the watch says back after saving: written here, not by the model, so it always matches what was saved. */
export function confirmation(x: { moment?: MomentInput | null; routine?: RoutineInput | null; place?: PlaceInput | null }): string {
  if (x.moment) {
    const m = x.moment
    const lead = m.lead_days.filter((n) => n > 0).sort((a, b) => b - a)
    const ahead = lead.length ? ` I'll remind you ${lead.map((n) => (n === 1 ? 'the day before' : n === 7 ? 'a week before' : `${n} days before`)).join(' and ')}.` : ''
    return `Saved: ${m.title}, ${m.yearly ? 'every year on ' : ''}${longDay(m.date)}${m.time ? ` at ${clock(m.time)}` : ''}.${ahead}`
  }
  if (x.routine) {
    const r = x.routine
    return `I'll remind you ${r.days.length ? `on ${r.days.map(dayName).join(', ')}` : 'every day'} at ${clock(r.time)}: ${r.title}.`
  }
  if (x.place) {
    const p = x.place.place
    // "a grocery store", but "home", "the office", "Priya's place", "Trader Joe's"
    const where = /^[a-z]/.test(p) && !/^(home|work|the |a |an )|'s\b/i.test(p) ? `a ${p}` : p
    return `I'll remind you when you ${x.place.leave ? 'leave' : 'get to'} ${where}: ${x.place.title}.`
  }
  return ''
}

/** iOS Calendar weekdays (Sunday = 1); empty = every day. */
export const iosWeekdays = (days: string[]) => days.map((d) => DAYS.indexOf(d) + 1)

/** Next run strictly after `now` ("YYYY-MM-DDTHH:MM", the user's local time). */
export function nextRun(r: { days: string; time: string }, now: string): string {
  const days = JSON.parse(r.days) as string[]
  for (let i = 0; i <= 7; i++) {
    const day = addDays(now.slice(0, 10), i)
    const at = `${day}T${r.time}`
    if (at > now && (!days.length || days.includes(DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]))) return at
  }
  throw new Error('unreachable: a week always has a run')
}
