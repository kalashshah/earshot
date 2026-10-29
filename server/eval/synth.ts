// Render eval/day.json to eval/audio/<id>.m4a with macOS `say` + ffmpeg.   node eval/synth.ts
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Conv = { id: string; start: string; speakers: Record<string, string>; lines: { s: string; t: string }[] }

const here = import.meta.dirname
const FFMPEG = '/opt/homebrew/bin/ffmpeg'
const day: Conv[] = JSON.parse(readFileSync(join(here, 'day.json'), 'utf8'))
const out = join(here, 'audio')
mkdirSync(out, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'earshot-synth-'))
const toWav = (src: string, dst: string, extra: string[] = []) =>
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...extra, '-i', src, '-ar', '16000', '-ac', '1', dst])

// A few pause lengths, picked per turn, so the rhythm isn't metronomic.
const PAUSES = [0.25, 0.4, 0.6, 0.9]
for (const p of PAUSES) toWav('anullsrc=r=16000:cl=mono', join(tmp, `pause${p}.wav`), ['-f', 'lavfi', '-t', String(p)])

try {
  for (const c of day) {
    const list: string[] = []
    c.lines.forEach((l, i) => {
      const voice = c.speakers[l.s]
      if (!voice) throw new Error(`${c.id}: no voice for speaker ${l.s}`)
      const aiff = join(tmp, `${c.id}-${i}.aiff`)
      execFileSync('say', ['-v', voice, '-r', '180', '-o', aiff, l.t])
      toWav(aiff, join(tmp, `${c.id}-${i}.wav`))
      if (i) list.push(`file '${join(tmp, `pause${PAUSES[(i * 7 + c.lines.length) % PAUSES.length]}.wav`)}'`)
      list.push(`file '${join(tmp, `${c.id}-${i}.wav`)}'`)
    })
    const listFile = join(tmp, `${c.id}.txt`)
    writeFileSync(listFile, list.join('\n'))
    const dst = join(out, `${c.id}.m4a`)
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'aac', '-b:a', '48k', '-ar', '16000', '-ac', '1', dst])
    const secs = Number(execFileSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], { encoding: 'utf8' }))
    console.log(`${c.start}  ${c.id}.m4a  ${secs.toFixed(1)}s`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
