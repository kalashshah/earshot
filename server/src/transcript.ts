// Clear speech scores 0.9+; a far voice under a fan 0.5–0.8. Below this the words are mostly guesses.
export const UNCLEAR = 0.5

// Deepgram (Nova-3) response → "Speaker 0: …" lines. With diarize+utterances we get one
// utterance per speaker turn; merge consecutive turns by the same speaker. Badly heard turns are
// wrapped in [unclear: …] so the model doesn't build a promise on a mishearing. Falls back to
// the plain transcript when utterances aren't present.
export function formatTranscript(out: any): string {
  const utterances: { speaker?: number; transcript?: string; confidence?: number; words?: Word[] }[] = out?.results?.utterances ?? []
  if (utterances.length) {
    const lines: { speaker: number; text: string }[] = []
    for (const u of utterances) {
      let text = (u.transcript ?? '').trim()
      if (!text) continue
      if (u.confidence != null && u.confidence < UNCLEAR) text = `[unclear: ${text}]`
      else text = markWords(u.words) ?? text
      const speaker = u.speaker ?? 0
      const last = lines[lines.length - 1]
      if (last && last.speaker === speaker) last.text += ' ' + text
      else lines.push({ speaker, text })
    }
    return lines.map((l) => `Speaker ${l.speaker}: ${l.text}`).join('\n')
  }
  return (out?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim()
}

type Word = { word?: string; punctuated_word?: string; confidence?: number }

// A clear sentence can still hold one garbled word, and it is usually the name: on a test clip "Nemotron" came back
// as "Nematron" at 0.45 and "Jakub" as "Jacob" at 0.29, with the words around them at 0.99. Null when all are clear.
function markWords(words?: Word[]): string | null {
  if (!words?.some((w) => w.confidence != null && w.confidence < UNCLEAR)) return null
  const out: string[] = []
  let run: string[] = []
  const flush = () => { if (run.length) out.push(`[unclear: ${run.join(' ')}]`); run = [] }
  for (const w of words) {
    const t = w.punctuated_word ?? w.word ?? ''
    if (w.confidence != null && w.confidence < UNCLEAR) run.push(t)
    else { flush(); out.push(t) }
  }
  flush()
  return out.join(' ')
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

/** A stored transcript with each "Speaker N:" swapped for who that turned out to be. Diarization renumbers
 *  speakers in every clip, so the previous clip's raw labels would point the model at the wrong people. */
export function nameSpeakers(transcript: string, names: Record<string, string | null>, userName?: string): string {
  return transcript.replace(/^Speaker (\d+):/gm, (_, n: string) => {
    const v = names[`Speaker ${n}`]
    const name = v && !/^speaker/i.test(v) ? who(v, userName) : `Person ${String.fromCharCode(65 + (Number(n) % 26))}`
    return `${name[0].toUpperCase()}${name.slice(1)}:`
  })
}

const LEVELS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** Inverse of the watch's ClipWriter.levelChar: 62 steps of 1.5 dB from -93 dBFS. */
export const levelDb = (c: string) => -93 + 1.5 * Math.max(0, LEVELS.indexOf(c))

/** Mean loudness (dB) at the watch's mic while each speaker talked: `levels` has one character per second
 *  of the clip, on the same clock as Deepgram's utterance times. Speakers with under 2 s of talk are left out. */
export function speakerLoudness(out: any, levels: string): Record<string, number> {
  const sum: Record<string, { db: number; s: number }> = {}
  for (const u of (out?.results?.utterances ?? []) as { speaker?: number; start?: number; end?: number }[]) {
    if (u.start == null || u.end == null) continue
    const k = `Speaker ${u.speaker ?? 0}`
    for (let i = Math.floor(u.start); i < Math.min(Math.ceil(u.end), levels.length); i++) {
      const s = Math.min(u.end, i + 1) - Math.max(u.start, i)
      sum[k] ??= { db: 0, s: 0 }
      sum[k].db += levelDb(levels[i]) * s
      sum[k].s += s
    }
  }
  return Object.fromEntries(Object.entries(sum).filter(([, v]) => v.s >= 2).map(([k, v]) => [k, Math.round(v.db / v.s)]))
}

// ponytail: a 4 dB lead is a guess at "clearly nearest" (wrist vs. across a table is 6–12 dB); tune on real clips.
export const NEAREST_DB = 4

/** A line for the model when one speaker was clearly the loudest at the mic, else null. */
export function loudnessHint(db: Record<string, number> | null): string | null {
  const ranked = Object.entries(db ?? {}).sort((a, b) => b[1] - a[1])
  if (ranked.length < 2 || ranked[0][1] - ranked[1][1] < NEAREST_DB) return null
  return `Loudness at the watch's mic: ${ranked.map(([k, v]) => `${k} ${v} dB`).join(', ')}. The watch is on the user's wrist, so ${ranked[0][0]}, clearly the loudest, is probably the user, unless what is said shows otherwise (a phone on speaker or a TV close to the watch can be louder).`
}
