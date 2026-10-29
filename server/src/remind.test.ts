import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanMoment, dedupeKey, nextOccurrence, reminders, type Moment } from './remind.ts'

const moment = (over: Partial<Moment>): Moment => ({
  id: 'x', kind: 'anniversary', title: 'Your anniversary with Sara', person: 'Sara', date: '2019-11-02', time: null, yearly: 1,
  prep: 'get Sara a gift', lead_days: '[7,1]', ideas: null, ideas_for: null, ...over,
})

test('yearly dates roll over, leap days land on Feb 28', () => {
  assert.equal(nextOccurrence({ date: '2019-11-02', yearly: 1 }, '2026-10-18'), '2026-11-02')
  assert.equal(nextOccurrence({ date: '2019-03-01', yearly: 1 }, '2026-10-18'), '2027-03-01')
  assert.equal(nextOccurrence({ date: '2000-02-29', yearly: 1 }, '2026-10-18'), '2027-02-28')
  assert.equal(nextOccurrence({ date: '2026-10-01', yearly: 0 }, '2026-10-18'), null)
})

test('anniversary: a week before and a day before, ideas only on the early one', () => {
  const r = reminders([moment({ ideas: 'She mentioned the ceramics class.', ideas_for: '2026-11-02' })], [], '2026-10-18')
  assert.deepEqual(r.map((x) => x.at), ['2026-10-26T09:00', '2026-11-01T09:00'])
  assert.equal(r[0].title, 'In a week: Your anniversary with Sara (Monday)')
  assert.equal(r[0].body, 'Get Sara a gift. She mentioned the ceramics class.')
  assert.equal(r[1].title, 'Tomorrow: Your anniversary with Sara')
  assert.equal(r[1].body, 'Get Sara a gift.')
})

test('past leads are dropped, same-day timed reminders use their time', () => {
  assert.deepEqual(reminders([moment({ lead_days: '[7,1]' })], [], '2026-10-30').map((x) => x.at), ['2026-11-01T09:00'])
  const call = moment({ kind: 'other', title: 'Call Mom', yearly: 0, date: '2026-10-18', time: '17:30', prep: null, lead_days: '[0]' })
  assert.deepEqual(reminders([call], [], '2026-10-18').map((x) => [x.at, x.body]), [['2026-10-18T17:30', 'At 17:30.']])
})

test('promises: yours the day before and on the day, theirs a day after', () => {
  const r = reminders([], [
    { id: 'a', owner: 'you', counterpart: 'Priya', what: 'send the deck', due_date: '2026-10-23', created_day: '2026-10-18' },
    { id: 'b', owner: 'Raj', counterpart: 'you', what: 'send the contract', due_date: '2026-10-23', created_day: '2026-10-18' },
    { id: 'c', owner: 'you', counterpart: null, what: 'book flights', due_date: '2026-10-19', created_day: '2026-10-18' },
  ], '2026-10-18')
  assert.deepEqual(r.map((x) => x.id), ['a:c:0', 'a:a:1', 'a:a:0', 'a:b:check'])
  assert.equal(r[3].body, 'Raj said they’d send the contract by Friday.')
})

test('cleanMoment rejects vague dates and fills defaults', () => {
  assert.equal(cleanMoment({ title: 'Trip', date: 'next month' }), null)
  const m = cleanMoment({ kind: 'party', title: 'Dinner', date: '2026-10-20', lead_days: [1, 7, 1, 99] })!
  assert.deepEqual([m.kind, m.lead_days, m.yearly], ['other', [7, 1], false])
  assert.equal(dedupeKey({ ...m, kind: 'birthday', person: 'Raj Mehta', yearly: true, date: '1990-03-04' }), 'birthday|03-04|raj')
})

test('routines: next run and cleaning', async () => {
  const { cleanRoutine, cleanPlace, nextRun, iosWeekdays } = await import('./remind.ts')
  const fri = { days: '["fri"]', time: '17:00' }
  assert.equal(nextRun(fri, '2026-10-18T14:05'), '2026-10-23T17:00') // Sunday → Friday
  assert.equal(nextRun(fri, '2026-10-23T17:00'), '2026-10-30T17:00') // at the minute → next week
  assert.equal(nextRun({ days: '[]', time: '22:00' }, '2026-10-18T21:59'), '2026-10-18T22:00')
  assert.deepEqual(cleanRoutine({ title: 'Meds', days: ['Monday', 'xyz', 'mon'], time: '21:00' }), { title: 'Meds', days: ['mon'], time: '21:00', question: null })
  assert.equal(cleanRoutine({ title: 'Meds', time: '9pm' }), null)
  assert.deepEqual(iosWeekdays(['sun', 'fri']), [1, 6])
  assert.equal(cleanPlace({ title: 'Badge', place: 'the office' })!.place, 'work')
  assert.deepEqual(cleanPlace({ title: 'Buy milk', place: 'grocery store' }), { title: 'Buy milk', place: 'grocery store', leave: false })
})

test('confirmations match what was saved', async () => {
  const { confirmation, cleanMoment, cleanRoutine, cleanPlace } = await import('./remind.ts')
  assert.equal(confirmation({ moment: cleanMoment({ title: 'Your anniversary with Sara', date: '2026-11-02', yearly: true, lead_days: [7, 1, 0] }) }),
    "Saved: Your anniversary with Sara, every year on Monday, November 2. I'll remind you a week before and the day before.")
  assert.equal(confirmation({ routine: cleanRoutine({ title: 'take your meds', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], time: '22:00' }) }),
    "I'll remind you every day at 10:00 PM: Take your meds.")
  assert.equal(confirmation({ place: cleanPlace({ title: 'Buy oat milk', place: 'grocery store' }) }), "I'll remind you when you get to a grocery store: Buy oat milk.")
  assert.equal(confirmation({ place: cleanPlace({ title: 'call Mom', place: 'work', leave: true }) }), "I'll remind you when you leave work: Call Mom.")
  assert.equal(confirmation({ place: cleanPlace({ title: 'Return the charger', place: "Priya's office" }) }), "I'll remind you when you get to Priya's office: Return the charger.")
})
