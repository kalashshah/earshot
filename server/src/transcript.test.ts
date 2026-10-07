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

test('falls back to channel transcript', () => {
  assert.equal(formatTranscript({ results: { channels: [{ alternatives: [{ transcript: ' hi there ' }] }] } }), 'hi there')
  assert.equal(formatTranscript({}), '')
})

test('word count ignores speaker labels', () => {
  assert.equal(wordCount('Speaker 0: one two\nSpeaker 1: three'), 3)
  assert.equal(wordCount(''), 0)
})
