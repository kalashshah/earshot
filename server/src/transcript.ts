// Deepgram (Nova-3) response → "Speaker 0: …" lines. With diarize+utterances we get one
// utterance per speaker turn; merge consecutive turns by the same speaker. Falls back to
// the plain transcript when utterances aren't present.
export function formatTranscript(out: any): string {
  const utterances: { speaker?: number; transcript?: string }[] = out?.results?.utterances ?? []
  if (utterances.length) {
    const lines: { speaker: number; text: string }[] = []
    for (const u of utterances) {
      const text = (u.transcript ?? '').trim()
      if (!text) continue
      const speaker = u.speaker ?? 0
      const last = lines[lines.length - 1]
      if (last && last.speaker === speaker) last.text += ' ' + text
      else lines.push({ speaker, text })
    }
    return lines.map((l) => `Speaker ${l.speaker}: ${l.text}`).join('\n')
  }
  return (out?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim()
}

export const wordCount = (s: string) => s.split(/\s+/).filter((w) => w && !/^Speaker$|^\d+:$/.test(w)).length
