// Ask the 40 questions to Earshot (/ask, memory route) and to three Nemotron models given the whole
// day's transcripts in-prompt; Nemotron Super judges each answer against gold. Writes results.{md,json}.
//   node eval/run.ts --api https://… --token-env EARSHOT_TOKEN --nebius-key-env NEBIUS_API_KEY [--max-usd 3] [--dry-run]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { MODELS, costUsd } from '../src/llm.ts'

const { values: a } = parseArgs({
  options: {
    api: { type: 'string', default: 'http://localhost:8787' },
    'token-env': { type: 'string', default: 'EARSHOT_TOKEN' },
    'nebius-key-env': { type: 'string', default: 'NEBIUS_API_KEY' },
    'max-usd': { type: 'string', default: '3' },
    concurrency: { type: 'string', default: '4' },
    'tz-offset-min': { type: 'string', default: '330' },
    'ingest-day': { type: 'string' }, // local date the seed was *processed* (GET /usage buckets by processing time); default today
    'dry-run': { type: 'boolean', default: false },
  },
})
type Q = { id: number; type: string; q: string; gold: string }
type Conv = { id: string; start: string; lines: { s: string; t: string }[] }
type Row = Q & { system: string; answer: string; latency_ms: number; input_tokens: number; output_tokens: number; cost_usd: number; correct?: boolean; reason?: string; error?: string }

const here = import.meta.dirname
const dry = a['dry-run']!
const api = a.api!.replace(/\/$/, '')
const maxUsd = Number(a['max-usd'])
const off = Number(a['tz-offset-min']) * 60_000
const ingestDay = a['ingest-day'] ?? new Date(Date.now() + off).toISOString().slice(0, 10)
const token = process.env[a['token-env']!]
const nebiusKey = process.env[a['nebius-key-env']!]
if (!dry && (!token || !nebiusKey)) throw new Error(`set ${a['token-env']} and ${a['nebius-key-env']}`)
const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

const day: Conv[] = JSON.parse(readFileSync(join(here, 'day.json'), 'utf8'))
const questions: Q[] = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8'))
const BASELINES = { 'Lightning, full day in prompt': MODELS.lightning, 'Super, full day in prompt': MODELS.super, 'Ultra, full day in prompt': MODELS.ultra } as const
const SYSTEMS = ['Earshot (/ask, memory)', ...Object.keys(BASELINES)]
const JUDGE = MODELS.super

// fetch with retry/backoff on 429, 5xx and network errors.
async function call(url: string, init: RequestInit): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let status = 0
    let detail = ''
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) })
      if (res.ok) return res.json()
      status = res.status
      detail = (await res.text()).slice(0, 200)
    } catch (e) {
      detail = String(e)
    }
    if ((status && status !== 429 && status < 500) || attempt >= 5) throw new Error(`${status || 'network'} ${detail}`)
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500))
  }
}

let spent = 0 // Token Factory $ this script spends directly (baselines + judge); Earshot's own spend comes from /usage.
async function nemotron(model: string, messages: { role: string; content: string }[], opts: { json?: boolean; maxTokens: number }) {
  if (spent >= maxUsd) throw new Error(`budget: --max-usd ${maxUsd} reached`)
  const out = await call('https://api.tokenfactory.nebius.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${nebiusKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  const input = out.usage?.prompt_tokens ?? 0
  const output = out.usage?.completion_tokens ?? 0
  const cost = costUsd(model, input, output)
  spent += cost
  return { text: String(out.choices?.[0]?.message?.content ?? '').trim(), input, output, cost }
}

// The day's transcripts as Earshot heard them (Deepgram output stored on each row).
async function transcripts(): Promise<string> {
  const ids = new Set(day.map((c) => c.id))
  let found: { id: string; started_at: number; transcript: string | null }[] = []
  if (dry) {
    found = day.map((c) => ({ id: c.id, started_at: Date.parse(`2026-01-01T${c.start}:00Z`) - off, transcript: c.lines.map((l) => `Speaker ${l.s}: ${l.t}`).join('\n') }))
  } else {
    let before = Number.MAX_SAFE_INTEGER
    for (let page = 0; page < 20 && found.length < ids.size; page++) {
      const { recordings } = await call(`${api}/recordings?before=${before}&limit=100`, { headers: auth })
      if (!recordings.length) break
      found.push(...recordings.filter((r: any) => ids.has(r.id)))
      before = recordings.at(-1).started_at
    }
  }
  const missing = [...ids].filter((id) => !found.some((r) => r.id === id && r.transcript))
  if (missing.length) console.warn(`warning: ${missing.length} clip(s) have no transcript (not seeded / empty / erased): ${missing.join(', ')}`)
  return found
    .filter((r) => r.transcript)
    .sort((x, y) => x.started_at - y.started_at)
    .map((r) => `### Conversation at ${new Date(r.started_at + off).toISOString().slice(11, 16)}\n${r.transcript}`)
    .join('\n\n')
}

const baselineMessages = (dayText: string, question: string) => [
  {
    role: 'system',
    content:
      'You are the user\'s memory of their real conversations yesterday, recorded by a wearable. "Speaker 0" is usually the wearer: call them "you". Answer from the transcripts only; if they do not contain the answer, say you did not hear that. One or two sentences.',
  },
  { role: 'user', content: `Transcripts:\n\n${dayText}\n\nQuestion: ${question}` },
]

const judgeMessages = (q: Q, answer: string) => [
  {
    role: 'system',
    content: `You grade answers from a personal memory assistant against a gold answer.
- If the gold answer is "not mentioned": correct only if the answer declines (says it did not hear / does not know / it was not mentioned). Any specific claimed answer is incorrect.
- Otherwise: correct if the answer states the key facts of the gold answer (names, numbers, dates) and contradicts none of them. Extra detail that doesn't contradict is fine; paraphrase is fine; "you"/"I" refer to the same user. Missing a key fact, or declining, is incorrect.
Reply JSON only: {"correct": true or false, "reason": "one short sentence"}`,
  },
  { role: 'user', content: `Question: ${q.q}\nGold answer: ${q.gold}\nAnswer to grade: ${answer}` },
]

type UsageRow = { day: string; model: string; cost_usd: number }
const usage = async (): Promise<UsageRow[]> => (await call(`${api}/usage?days=30`, { headers: auth })).usage
const sumCost = (rows: UsageRow[], f: (r: UsageRow) => boolean = () => true) => rows.filter(f).reduce((s, r) => s + (r.cost_usd ?? 0), 0)

// ---- main
const dayText = await transcripts()
const estIn = Math.ceil(dayText.length / 4) + 200
const est = questions.length * (Object.values(BASELINES).reduce((s, m) => s + costUsd(m, estIn, 150), 0) + SYSTEMS.length * costUsd(JUDGE, 400, 60))
console.log(`day transcript ≈ ${estIn} tokens; estimated Token Factory spend ≈ $${est.toFixed(3)} (cap $${maxUsd})`)
if (est > maxUsd) throw new Error('estimated spend exceeds --max-usd; raise it to proceed')

if (dry) {
  const q = questions[0]
  console.log(`\nPOST ${api}/ask`, JSON.stringify({ question: q.q }))
  for (const [name, model] of Object.entries(BASELINES)) {
    const m = baselineMessages(dayText, q.q)
    console.log(`\n[${name}] POST tokenfactory/v1/chat/completions model=${model} thinking=off user-prompt=${m[1].content.length} chars:\n${m[1].content.slice(0, 300)}…\n…${m[1].content.slice(-200)}`)
  }
  console.log(`\n[judge ${JUDGE}]`, JSON.stringify(judgeMessages(q, '(answer)'), null, 1))
  console.log(`\nwould run ${questions.length} × ${SYSTEMS.length} answers + as many judge calls, concurrency ${a.concurrency}`)
  process.exit(0)
}

const usageBefore = await usage()
const tasks: (() => Promise<Row>)[] = questions.flatMap((q) =>
  SYSTEMS.map((system) => async (): Promise<Row> => {
    const row: Row = { ...q, system, answer: '', latency_ms: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }
    try {
      const t0 = performance.now()
      if (system.startsWith('Earshot')) {
        row.answer = (await call(`${api}/ask`, { method: 'POST', headers: auth, body: JSON.stringify({ question: q.q }) })).answer
      } else {
        const r = await nemotron(BASELINES[system as keyof typeof BASELINES], baselineMessages(dayText, q.q), { maxTokens: 300 })
        Object.assign(row, { answer: r.text, input_tokens: r.input, output_tokens: r.output, cost_usd: r.cost })
      }
      row.latency_ms = Math.round(performance.now() - t0)
      const j = await nemotron(JUDGE, judgeMessages(q, row.answer), { json: true, maxTokens: 200 })
      const verdict = JSON.parse(j.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { correct?: boolean; reason?: string }
      row.correct = verdict.correct === true
      row.reason = verdict.reason
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e)
    }
    console.log(`#${String(q.id).padStart(2)} ${system.padEnd(30)} ${row.error ? `ERROR ${row.error}` : row.correct ? 'ok ' : 'MISS'} ${row.latency_ms}ms`)
    return row
  }),
)
const rows: Row[] = []
let next = 0
await Promise.all(Array.from({ length: Number(a.concurrency) }, async () => { while (next < tasks.length) rows.push(await tasks[next++]()) }))
rows.sort((x, y) => x.id - y.id || SYSTEMS.indexOf(x.system) - SYSTEMS.indexOf(y.system))

// Earshot's own spend: ingest (Deepgram + extraction + drafts) from /usage before the run, /ask calls = the delta.
const usageAfter = await usage()
const ingestUsd = sumCost(usageBefore, (r) => r.day === ingestDay)
const askUsd = sumCost(usageAfter) - sumCost(usageBefore)

const types = [...new Set(questions.map((q) => q.type))]
const pct = (xs: Row[]) => (xs.length ? `${Math.round((100 * xs.filter((r) => r.correct).length) / xs.length)}%` : '–')
const summary = SYSTEMS.map((system) => {
  const rs = rows.filter((r) => r.system === system)
  const una = rs.filter((r) => r.type === 'unanswerable' && !r.error)
  const perQ = system.startsWith('Earshot') ? askUsd / rs.length : rs.reduce((s, r) => s + r.cost_usd, 0) / rs.length
  return {
    system,
    accuracy: pct(rs),
    byType: Object.fromEntries(types.map((t) => [t, pct(rs.filter((r) => r.type === t))])),
    hallucination: una.length ? `${Math.round((100 * una.filter((r) => !r.correct).length) / una.length)}%` : '–',
    errors: rs.filter((r) => r.error).length,
    meanLatencyMs: Math.round(rs.reduce((s, r) => s + r.latency_ms, 0) / Math.max(1, rs.filter((r) => !r.error).length)),
    usdPerQuestion: perQ,
    usdPerDay: perQ * questions.length + (system.startsWith('Earshot') ? ingestUsd : 0),
  }
})
const judgeUsd = spent - rows.reduce((s, r) => s + r.cost_usd, 0)

const md = `# Earshot eval — ${new Date().toISOString().slice(0, 10)}

${day.length} synthetic conversations, ${questions.length} questions (${types.map((t) => `${questions.filter((q) => q.type === t).length} ${t}`).join(', ')}).

| System | Accuracy | Hallucination (unanswerable) | Mean latency | $ / question | $ / day | Errors |
|---|---|---|---|---|---|---|
${summary.map((s) => `| ${s.system} | ${s.accuracy} | ${s.hallucination} | ${(s.meanLatencyMs / 1000).toFixed(2)} s | $${s.usdPerQuestion.toFixed(5)} | $${s.usdPerDay.toFixed(4)} | ${s.errors} |`).join('\n')}

## Accuracy by question type

| System | ${types.join(' | ')} |
|---|${types.map(() => '---|').join('')}
${summary.map((s) => `| ${s.system} | ${types.map((t) => s.byType[t]).join(' | ')} |`).join('\n')}

## Method

- Day: ${day.length} scripted conversations rendered with macOS \`say\` (synthetic TTS voices), uploaded through the real \`PUT /recordings\` path, transcribed by Deepgram Nova-3 and extracted into MemoryHQ by Nemotron Lightning — the same pipeline as the watch.
- Earshot = \`POST /ask\`: memory search (top 15) + open commitments → Nemotron Lightning. Baselines get every transcript of the day (≈${estIn} tokens) in the prompt, same instructions, thinking off, temperature 0.
- Judge: ${JUDGE}, thinking off, JSON mode, against hand-written gold answers. Unanswerable questions count as correct only when the system declines; hallucination = unanswerable questions answered anyway. LLM judges can err; per-answer verdicts and reasons are in results.json.
- $ / day = ${questions.length} questions; Earshot adds its real ingest cost for ${ingestDay} from \`GET /usage\` ($${ingestUsd.toFixed(4)}: Deepgram + extraction + follow-up drafts). Baselines reuse Earshot's transcripts, so they exclude transcription cost. Earshot's /ask cost is the /usage delta over the run ($${askUsd.toFixed(4)}), so other traffic during the run would inflate it.
- Prices per 1M tokens in/out: Lightning $0.06/$0.24, Super $0.30/$0.90, Ultra $1/$3. Judge spend (not counted above): $${judgeUsd.toFixed(4)}.
- Single run, n = ${questions.length} per system: differences of a few points are noise.
`
writeFileSync(join(here, 'results.md'), md)
writeFileSync(join(here, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), api, ingestDay, ingestUsd, askUsd, judgeUsd, summary, rows }, null, 2))
console.log(`\n${md}\nwrote eval/results.md, eval/results.json — Token Factory spend this run $${spent.toFixed(4)}`)
