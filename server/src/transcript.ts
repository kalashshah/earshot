// Clear speech scores 0.9+; a far voice under a fan 0.5–0.8. Below this the words are mostly guesses.
export const UNCLEAR = 0.5

// Deepgram (Nova-3) response → "Speaker 0: …" lines. With diarize+utterances we get one
// utterance per speaker turn; merge consecutive turns by the same speaker. Badly heard turns are
// wrapped in [unclear: …] so the model doesn't build a promise on a mishearing. Falls back to
// the plain transcript when utterances aren't present.
export function formatTranscript(out: any): string {
  const utterances: { speaker?: number; transcript?: string; confidence?: number }[] = out?.results?.utterances ?? []
  if (utterances.length) {
    const lines: { speaker: number; text: string }[] = []
    for (const u of utterances) {
      let text = (u.transcript ?? '').trim()
      if (!text) continue
      if (u.confidence != null && u.confidence < UNCLEAR) text = `[unclear: ${text}]`
      const speaker = u.speaker ?? 0
      const last = lines[lines.length - 1]
      if (last && last.speaker === speaker) last.text += ' ' + text
      else lines.push({ speaker, text })
    }
    return lines.map((l) => `Speaker ${l.speaker}: ${l.text}`).join('\n')
  }
  return (out?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim()
}

export const wordCount = (s: string) => s.split(/\s+/).filter((w) => w && !/^Speaker$|^\d+:$|^\[unclear:$/.test(w)).length

// The prompt asks for "you" and real names; this enforces it when the model slips.
export function who(name: string, userName?: string): string {
  const n = name.trim()
  if (/^(you|me|i|myself)$/i.test(n)) return 'you'
  if (userName && n.split(/\s+/)[0].toLowerCase() === userName.toLowerCase()) return 'you'
  if (/^speaker\s*\d+/i.test(n)) return 'someone'
  return n
}

/** "Speaker 4 (dad) suggested…" → "your dad suggested…", using the model's own map of who each label is. */
export function unlabelSpeakers(text: string, names: Record<string, string | null>, userName?: string): string {
  return text.replace(/\bSpeaker (\d+)(?:\s*\([^)]*\))?/g, (_, n: string) => {
    const v = names[`Speaker ${n}`]
    return v && !/^speaker/i.test(v) ? who(v, userName) : 'someone'
  })
}
