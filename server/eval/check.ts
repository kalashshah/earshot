// Sanity-check day.json + questions.json: every gold answer is grounded in the script.   node eval/check.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Q = { id: number; type: string; q: string; gold: string; evidence?: string[]; absent?: string[] }
const here = import.meta.dirname
const day: { id: string; speakers: Record<string, string>; lines: { s: string; t: string }[] }[] = JSON.parse(readFileSync(join(here, 'day.json'), 'utf8'))
const qs: Q[] = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8'))
const text = day.flatMap((c) => c.lines.map((l) => l.t)).join('\n').toLowerCase()

assert.equal(day.length, 12)
assert.equal(new Set(day.map((c) => c.id)).size, 12)
for (const c of day) {
  assert.equal(c.speakers['0'], 'Daniel', `${c.id}: speaker 0 is "you"`)
  const n = Object.keys(c.speakers).length
  assert.ok(n >= 2 && n <= 3, `${c.id}: ${n} speakers`)
  for (const l of c.lines) assert.ok(c.speakers[l.s], `${c.id}: unknown speaker ${l.s}`)
}
assert.equal(qs.length, 40)
assert.equal(new Set(qs.map((q) => q.id)).size, 40)
assert.equal(qs.filter((q) => q.type === 'unanswerable').length, 4)

const bad: string[] = []
for (const q of qs) {
  if (q.type === 'unanswerable') {
    assert.equal(q.gold, 'not mentioned')
    for (const a of q.absent ?? []) if (new RegExp(`\\b${a}\\b`, 'i').test(text)) bad.push(`#${q.id} "${a}" appears in day.json`)
    continue
  }
  assert.ok(q.evidence?.length, `#${q.id} needs evidence`)
  for (const e of q.evidence!) if (!text.includes(e.toLowerCase())) bad.push(`#${q.id} evidence missing: "${e}"`)
  // Every number in a gold answer must be said somewhere that day.
  for (const n of q.gold.match(/\d[\d,]*/g) ?? []) if (!text.includes(n.replace(/,$/, ''))) bad.push(`#${q.id} number ${n} not in day.json`)
}
assert.deepEqual(bad, [])
console.log(`ok: 12 conversations, ${qs.length} questions, ${Object.entries(Object.groupBy(qs, (q) => q.type)).map(([t, v]) => `${t} ${v!.length}`).join(', ')}`)
