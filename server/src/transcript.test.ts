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
