import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseJson, costUsd, MODELS } from './llm.ts'

test('parseJson survives fences and prose', () => {
  assert.deepEqual(parseJson('Sure!\n```json\n{"a": {"b": 1}}\n```'), { a: { b: 1 } })
  assert.throws(() => parseJson('no json here'))
})

test('costUsd uses per-million prices', () => {
  assert.equal(costUsd(MODELS.ultra, 1_000_000, 1_000_000), 4)
  assert.equal(costUsd('unknown', 10, 10), 0)
})

test('who() maps the wearer to "you" and hides diarization labels', async () => {
  const { who } = await import('./transcript.ts')
  assert.equal(who('Dev', 'Dev'), 'you')
  assert.equal(who('dev patel', 'Dev'), 'you')
  assert.equal(who('Speaker 1 (sibling)', 'Dev'), 'someone')
  assert.equal(who('Priya', 'Dev'), 'Priya')
})

test('timezone day math', async () => {
  const { localDay, dayStart, stamp, localHour, validTz } = await import('./time.ts')
  const t = Date.parse('2026-10-16T20:00:00Z') // 01:30 next day in Kolkata
  assert.equal(localDay(t, 'Asia/Kolkata'), '2026-10-17')
  assert.equal(localDay(t, 'America/Los_Angeles'), '2026-10-16')
  assert.equal(stamp(t, 'Asia/Kolkata'), '2026-10-17 01:30')
  assert.equal(localHour(Date.parse('2026-10-17T01:30:00Z'), 'Asia/Kolkata'), 7)
  assert.equal(dayStart('2026-10-17', 'Asia/Kolkata'), Date.parse('2026-10-16T18:30:00Z'))
  assert.equal(validTz('Mars/Olympus'), false)
})
