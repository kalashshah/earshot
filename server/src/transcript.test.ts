import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { formatTranscript, wordCount } from './transcript.ts'

test('merges consecutive turns by speaker', () => {
  const out = { results: { utterances: [
    { speaker: 0, transcript: 'Hey, ' }, { speaker: 0, transcript: 'got a minute?' },
    { speaker: 1, transcript: 'Sure.' }, { speaker: 0, transcript: '' },
  ] } }
  assert.equal(formatTranscript(out), 'Speaker 0: Hey, got a minute?\nSpeaker 1: Sure.')
})

test('marks badly heard turns', () => {
  const out = { results: { utterances: [
    { speaker: 0, transcript: 'Send it Friday.', confidence: 0.95 },
    { speaker: 1, transcript: 'uh mumble', confidence: 0.3 },
    { speaker: 1, transcript: 'okay', confidence: 0.9 },
  ] } }
  assert.equal(formatTranscript(out), 'Speaker 0: Send it Friday.\nSpeaker 1: [unclear: uh mumble] okay')
  assert.equal(wordCount(formatTranscript(out)), 6)
})

test('falls back to channel transcript', () => {
  assert.equal(formatTranscript({ results: { channels: [{ alternatives: [{ transcript: ' hi there ' }] }] } }), 'hi there')
  assert.equal(formatTranscript({}), '')
})

test('word count ignores speaker labels', () => {
  assert.equal(wordCount('Speaker 0: one two\nSpeaker 1: three'), 3)
  assert.equal(wordCount(''), 0)
})

test('speaker labels become who they are', async () => {
  const { unlabelSpeakers } = await import('./transcript.ts')
  const names = { 'Speaker 0': 'Kalash', 'Speaker 4': 'your dad', 'Speaker 2': null }
  assert.equal(unlabelSpeakers('Speaker 4 suggests Speaker 0 (Kalash) meet Ashish.', names, 'Kalash'), 'your dad suggests you meet Ashish.')
  assert.equal(unlabelSpeakers("Speaker 2's badge, Speaker 7 too", names), "someone's badge, someone too")
})

test('previous clip is relabelled with who its speakers were', async () => {
  const { nameSpeakers } = await import('./transcript.ts')
  const t = 'Speaker 0: Papa, chai?\nSpeaker 1: Haan.\nSpeaker 2: Speaker 0: is not a label here'
  assert.equal(nameSpeakers(t, { 'Speaker 0': 'Kalash', 'Speaker 1': 'your dad' }, 'Kalash'), 'you: Papa, chai?\nyour dad: Haan.\nPerson C: Speaker 0: is not a label here')
  assert.equal(nameSpeakers('Speaker 0: hi', {}), 'Person A: hi')
})

test('loudest speaker at the mic is pointed out, only when clearly so', async () => {
  const { speakerLoudness, loudnessHint, levelDb } = await import('./transcript.ts')
  assert.equal(levelDb('0'), -93)
  assert.equal(levelDb('Z'), -1.5)
  // 0–4 s quiet (-45 dB = 'w'), 4–8 s loud (-30 dB = 'G'); a third speaker says one word
  const levels = 'wwwwGGGG'
  const out = { results: { utterances: [
    { speaker: 0, start: 0.2, end: 3.8 }, { speaker: 1, start: 4.1, end: 7.9 }, { speaker: 2, start: 7.9, end: 8.4 },
  ] } }
  const db = speakerLoudness(out, levels)
  assert.deepEqual(db, { 'Speaker 0': -45, 'Speaker 1': -30 })
  assert.match(loudnessHint(db)!, /Speaker 1 -30 dB, Speaker 0 -45 dB.*so Speaker 1, clearly/)
  assert.equal(loudnessHint({ 'Speaker 0': -40, 'Speaker 1': -42 }), null)
  assert.equal(loudnessHint({ 'Speaker 0': -40 }), null)
  assert.equal(loudnessHint(null), null)
})
