// Upload the scripted day to Earshot as if the watch recorded it, then wait for processing.
//   node eval/seed.ts --api https://… --token-env EARSHOT_TOKEN [--day YYYY-MM-DD] [--tz-offset-min 330] [--dry-run]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values: a } = parseArgs({
  options: {
    api: { type: 'string', default: 'http://localhost:8787' },
    'token-env': { type: 'string', default: 'EARSHOT_TOKEN' },
    day: { type: 'string' },
    'tz-offset-min': { type: 'string', default: '330' },
    'dry-run': { type: 'boolean', default: false },
  },
})
const here = import.meta.dirname
const api = a.api!.replace(/\/$/, '')
const off = Number(a['tz-offset-min']) * 60_000
const day = a.day ?? new Date(Date.now() + off - 86_400_000).toISOString().slice(0, 10)
if (!/^\d{4}-\d\d-\d\d$/.test(day)) throw new Error('--day must be YYYY-MM-DD')
const token = process.env[a['token-env']!]
if (!token && !a['dry-run']) throw new Error(`set ${a['token-env']} to the Earshot APP_TOKEN`)
const auth = { authorization: `Bearer ${token}` }

const convs: { id: string; start: string }[] = JSON.parse(readFileSync(join(here, 'day.json'), 'utf8'))
const ids = new Set(convs.map((c) => c.id))

for (const c of convs) {
  const file = join(here, 'audio', `${c.id}.m4a`)
  const body = readFileSync(file) // throws if synth.ts hasn't run
  const secs = Number(execFileSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }))
  const headers = { 'x-started-at': String(Date.parse(`${day}T${c.start}:00Z`) - off), 'x-duration-ms': String(Math.round(secs * 1000)), 'content-type': 'audio/mp4' }
  if (a['dry-run']) {
    console.log(`PUT ${api}/recordings/${c.id}`, { ...headers, authorization: 'Bearer <redacted>', bytes: body.length })
    continue
  }
  const res = await fetch(`${api}/recordings/${c.id}`, { method: 'PUT', headers: { ...auth, ...headers }, body })
  console.log(`${c.start} ${c.id} → ${res.status} ${await res.text()}`)
  if (!res.ok) process.exit(1)
}
if (a['dry-run']) process.exit(0)

// Poll until every clip is done/failed. 'empty' rows are hidden by GET /recordings, so a clip
// that stays missing once nothing is queued counts as empty.
const before = Date.parse(`${day}T00:00:00Z`) - off + 86_400_000
const deadline = Date.now() + 20 * 60_000
let rows: { id: string; status: string; title: string | null; memories_added: number; error: string | null }[] = []
while (Date.now() < deadline) {
  const res = await fetch(`${api}/recordings?before=${before}&limit=100`, { headers: auth })
  if (!res.ok) throw new Error(`GET /recordings ${res.status}`)
  rows = ((await res.json()) as { recordings: typeof rows }).recordings.filter((r) => ids.has(r.id))
  const pending = rows.filter((r) => r.status === 'queued').length
  console.log(`${new Date().toISOString().slice(11, 19)}  done ${rows.filter((r) => r.status === 'done').length}  failed ${rows.filter((r) => r.status === 'failed').length}  queued ${pending}  missing ${ids.size - rows.length}`)
  if (!pending) break
  await new Promise((r) => setTimeout(r, 10_000))
}
for (const c of convs) {
  const r = rows.find((r) => r.id === c.id)
  console.log(`${c.start}  ${(r?.status ?? 'empty?').padEnd(7)} ${String(r?.memories_added ?? 0).padStart(2)} memories  ${r?.title ?? ''}${r?.error ? `  ERROR ${r.error}` : ''}`)
}
