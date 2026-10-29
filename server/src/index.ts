import { formatTranscript, wordCount } from './transcript'
import { answer, clipIdsFrom, draftFollowUp, routeQuestion, extractClip, morningBrief, prepCard, prepIdeas, research, routineAnswer, type Entities } from './brain'
import { addDays, confirmation, dedupeKey, iosWeekdays, nextOccurrence, nextRun, reminders, type DueAction, type Moment, type MomentInput, type Routine } from './remind'
import { tavilySearch, type LlmEnv } from './llm'
import { dayStart, localDay, localHour, stamp, validTz } from './time'

interface Env {
  DB: D1Database
  AUDIO: R2Bucket
  AI: Ai
  PROCESS: Queue<{ id: string }>
  MEMORYHQ: Fetcher
  MEMORYHQ_URL: string
  NEBIUS_API_KEY: string
  TAVILY_API_KEY: string
  INTERNAL_SECRET?: string // earshot-web → here over the service binding, acting as a signed-in user
  // Legacy single-user token (the original app build, and the public demo deploy): user "me", settings from vars.
  APP_TOKEN?: string
  // One MemoryHQ workspace for all of Earshot; each user is an end user in it (x-end-user-id).
  MEMORYHQ_WORKSPACE?: string
  MEMORYHQ_KEY?: string
  TZ?: string
  RETENTION_DAYS?: string
  DAILY_USD_CAP?: string
  USER_NAME?: string
  KEEP_AUDIO?: string // comma-separated user ids whose audio is kept after transcription, only while tuning the mic
}

type Recording = {
  id: string; user_id: string; started_at: number; duration_ms: number; bytes: number; r2_key: string
  status: string; title: string | null; summary: string | null; transcript: string | null
  memories_added: number; error: string | null; created_at: number; updated_at: number
  entities: string | null; memory_ids: string | null; music: number | null; ambient: string | null
}

type User = {
  id: string; email: string | null; name: string | null; tz: string; retention_days: number; daily_usd_cap: number
  created_at: number
}

const LEGACY_ID = 'me'
const MAX_BYTES = 50 * 1024 * 1024
const MIN_WORDS = 3 // "हां", "hm": noise. "Call Priya at nine" is four words, and length says nothing about importance
// ponytail: Workers AI list price for Nova-3, hard-coded; read it from billing if it starts to matter.
const DEEPGRAM_USD_PER_MIN = 0.0052
const PAIR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O, 1/I/L
const PAIR_TTL_MS = 10 * 60_000

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env)
    } catch (err) {
      console.error('request failed', req.method, new URL(req.url).pathname, err)
      return json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  },

  async queue(batch: MessageBatch<{ id: string }>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await processRecording(env, msg.body.id)
        msg.ack()
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        console.error('process failed', msg.body.id, msg.attempts, error)
        if (msg.attempts >= 3) {
          await setFields(env, msg.body.id, { status: 'failed', error })
          msg.ack()
        } else {
          msg.retry({ delaySeconds: 30 * msg.attempts })
        }
      }
    }
  },

  // Hourly: whoever's local time is 07:00 gets yesterday's brief, then transcripts past their retention are erased.
  async scheduled(ctrl: ScheduledController, env: Env): Promise<void> {
    const { results } = await env.DB.prepare('SELECT * FROM users').all<User>()
    const users = env.APP_TOKEN ? [...results, legacyUser(env)] : results
    // A consumer killed mid-clip (time/memory limit) leaves no error and its message runs out of retries: re-send.
    const { results: stuck } = await env.DB.prepare(
      `SELECT id FROM recordings WHERE status = 'queued' AND updated_at < ? AND created_at > ?`
    ).bind(Date.now() - 30 * 60_000, Date.now() - 2 * 86_400_000).all<{ id: string }>()
    for (const { id } of stuck) {
      await env.DB.prepare('UPDATE recordings SET updated_at = ? WHERE id = ?').bind(Date.now(), id).run()
      await env.PROCESS.send({ id })
    }
    for (const user of users) {
      await fillAnswers(env, user, 3).catch((err) => console.error('routines failed', user.id, err))
      if (localHour(ctrl.scheduledTime, user.tz) !== 7) continue
      await fillIdeas(env, user).catch((err) => console.error('ideas failed', user.id, err))
      try {
        await runBrief(env, user, localDay(ctrl.scheduledTime - 86_400_000, user.tz))
      } catch (err) {
        console.error('brief failed', user.id, err)
      }
      await env.DB.prepare('UPDATE recordings SET transcript = NULL WHERE user_id = ? AND started_at < ? AND transcript IS NOT NULL')
        .bind(user.id, Date.now() - user.retention_days * 86_400_000).run()
    }
  },
} satisfies ExportedHandler<Env, { id: string }>

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  if (url.pathname === '/health') return json({ ok: true })

  // POST /devices/claim { code, name } → { token, user } — the only unauthenticated call: the iPhone pairing step
  if (req.method === 'POST' && parts[0] === 'devices' && parts[1] === 'claim') {
    const { code, name, verifier } = await req.json<{ code?: string; name?: string; verifier?: string }>().catch(() => ({}) as { code?: string; name?: string; verifier?: string })
    const normalized = (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (normalized.length !== 8) return json({ error: 'Enter the 8-character code from the website' }, 400)
    const hash = await sha256(normalized)
    // codes minted by in-app sign-in carry a challenge; only the app holding its verifier can claim them
    const row = await env.DB.prepare('DELETE FROM pair_codes WHERE code_hash = ? AND expires_at > ? AND (challenge IS NULL OR challenge = ?) RETURNING user_id')
      .bind(hash, Date.now(), await sha256(verifier ?? '')).first<{ user_id: string }>()
    if (!row) return json({ error: 'That code is wrong or expired. Make a new one on the website.' }, 404)
    const user = await getUser(env, row.user_id)
    if (!user) return json({ error: 'Account not found' }, 404)
    const token = `esd_${randomHex(32)}`
    await env.DB.prepare('INSERT INTO devices (id, user_id, name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), user.id, (name ?? 'iPhone').slice(0, 80), await sha256(token), Date.now(), Date.now()).run()
    return json({ token, user: { name: user.name } })
  }

  const user = await authenticate(req, env)
  if (!user) return json({ error: 'Unauthorized' }, 401)
  const tz = user.tz

  // PUT /recordings/:id  body = audio (id minted on the watch → idempotent), headers x-started-at (ms), x-duration-ms,
  // x-music (0–100), x-ambient ("crowd, dishes": the iPhone's sound classifier, trimmed to letters/commas here)
  if (req.method === 'PUT' && parts[0] === 'recordings' && parts[1]) {
    const id = parts[1]
    if (!/^[0-9A-Fa-f-]{36}$/.test(id)) return json({ error: 'id must be a UUID' }, 400)
    const startedAt = Number(req.headers.get('x-started-at'))
    const durationMs = Number(req.headers.get('x-duration-ms') ?? 0)
    const music = req.headers.has('x-music') ? Math.max(0, Math.min(100, Math.round(Number(req.headers.get('x-music'))))) : null
    const ambient = (req.headers.get('x-ambient') ?? '').replace(/[^a-z, ]/gi, '').trim().slice(0, 120) || null
    if (!Number.isFinite(startedAt) || startedAt <= 0) return json({ error: 'x-started-at required' }, 400)
    const contentType = req.headers.get('content-type') ?? 'audio/mp4'
    const len = Number(req.headers.get('content-length') ?? 0)
    if (len > MAX_BYTES) return json({ error: 'Too large' }, 413)

    const existing = await env.DB.prepare('SELECT status FROM recordings WHERE id = ? AND user_id = ?').bind(id, user.id).first()
    if (existing) return json({ id, status: existing.status }) // retried upload

    const key = `${user.id}/${id}.m4a`
    const obj = await env.AUDIO.put(key, req.body, { httpMetadata: { contentType } })
    const now = Date.now()
    const { meta } = await env.DB.prepare(
      `INSERT OR IGNORE INTO recordings (id, user_id, started_at, duration_ms, bytes, r2_key, music, ambient, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`
    ).bind(id, user.id, startedAt, durationMs, obj.size, key, music, ambient, now, now).run()
    if (!meta.changes) return json({ error: 'id already used' }, 409)
    await env.PROCESS.send({ id })
    return json({ id, status: 'queued' }, 202)
  }

  // GET /recordings?before=<started_at ms>&limit=30   (newest first, keyset paginated)
  if (req.method === 'GET' && parts[0] === 'recordings' && !parts[1]) {
    const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100)
    const { results } = await env.DB.prepare(
      `SELECT id, started_at, duration_ms, status, title, summary, transcript, memories_added, entities, error
       FROM recordings WHERE user_id = ? AND started_at < ? AND status != 'empty'
       ORDER BY started_at DESC LIMIT ?`
    ).bind(user.id, before, limit).all()
    return json({ recordings: results })
  }

  // POST /recordings/:id/retry — re-run a failed recording (finished stages are kept)
  if (req.method === 'POST' && parts[0] === 'recordings' && parts[2] === 'retry') {
    const { meta } = await env.DB.prepare(`UPDATE recordings SET status = 'queued', error = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'failed'`)
      .bind(Date.now(), parts[1], user.id).run()
    if (!meta.changes) return json({ error: 'Not a failed recording' }, 409)
    await env.PROCESS.send({ id: parts[1] })
    return json({ id: parts[1], status: 'queued' }, 202)
  }

  // DELETE /recordings/:id — forget a conversation: audio, transcript, its commitments and the memories it produced
  if (req.method === 'DELETE' && parts[0] === 'recordings' && parts[1]) {
    const row = await env.DB.prepare('SELECT r2_key, memory_ids FROM recordings WHERE id = ? AND user_id = ?').bind(parts[1], user.id).first<{ r2_key: string; memory_ids: string | null }>()
    if (!row) return json({ error: 'Not found' }, 404)
    await env.AUDIO.delete(row.r2_key)
    for (const mid of JSON.parse(row.memory_ids ?? '[]') as string[]) {
      const res = await memoryhq(env, user, `/memories/${mid}`, undefined, 'DELETE')
      if (!res.ok && res.status !== 404) return json({ error: `Could not forget memory ${mid}` }, 502)
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM actions WHERE recording_id = ? AND user_id = ?').bind(parts[1], user.id),
      env.DB.prepare('DELETE FROM moments WHERE recording_id = ? AND user_id = ?').bind(parts[1], user.id),
      env.DB.prepare('DELETE FROM recordings WHERE id = ? AND user_id = ?').bind(parts[1], user.id),
    ])
    return json({ ok: true })
  }

  // GET /memories?offset=0&limit=50 → MemoryHQ (the key never leaves the server)
  if (req.method === 'GET' && parts[0] === 'memories') {
    const q = new URLSearchParams({ scope: 'user', limit: url.searchParams.get('limit') ?? '50', offset: url.searchParams.get('offset') ?? '0' })
    const res = await memoryhq(env, user, `/memories?${q}`)
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
  }

  // POST /memories/search { query }
  if (req.method === 'POST' && parts[0] === 'memories' && parts[1] === 'search') {
    const { query } = await req.json<{ query: string }>()
    const res = await memoryhq(env, user, '/memories/search', { query, scope: 'user', limit: 20 })
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
  }

  // DELETE /memories/:id — forget one memory
  if (req.method === 'DELETE' && parts[0] === 'memories' && parts[1]) {
    const res = await memoryhq(env, user, `/memories/${encodeURIComponent(parts[1])}`, undefined, 'DELETE')
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
  }

  // POST /ask { question } → { answer, sources: [{id, started_at, title}] }   (the wrist question)
  if (req.method === 'POST' && parts[0] === 'ask') {
    const { question } = await req.json<{ question: string }>()
    if (!question?.trim()) return json({ error: 'question required' }, 400)
    const llm = llmEnv(env, user)
    // ponytail: index = last 90 days, ≤1000 conversations. Page by month if someone talks more than that.
    const [memories, { results: recent }] = await Promise.all([
      searchMemories(env, user, question, 20),
      env.DB.prepare(`SELECT id, started_at, title, summary, entities FROM recordings WHERE user_id = ? AND status = 'done' AND started_at > ? ORDER BY started_at DESC LIMIT 1000`)
        .bind(user.id, Date.now() - 90 * 86_400_000).all<Pick<Recording, 'id' | 'started_at' | 'title' | 'summary' | 'entities'>>(),
    ])
    const index = recent.map((r) => {
      const e = JSON.parse(r.entities ?? '{}') as Partial<Entities> & { facts?: string[] }
      return `${r.id} · ${stamp(r.started_at, tz)} · ${r.title} — ${r.summary} People: ${(e.people ?? []).map((p) => p.name).join(', ')}. ${(e.facts ?? []).join(' ')}`
    })
    const known = new Set(recent.map((r) => r.id))
    const routed = (await routeQuestion(llm, user.id, question.slice(0, 500), index)).filter((id) => known.has(id))
    const ids = [...new Set([...routed, ...clipIdsFrom(memories)])].slice(0, 7)
    const clips = ids.length
      ? (await env.DB.prepare(`SELECT id, started_at, title, summary, transcript FROM recordings WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')}) ORDER BY started_at`)
          .bind(user.id, ...ids).all<Pick<Recording, 'id' | 'started_at' | 'title' | 'summary' | 'transcript'>>()).results
          .map((r) => ({ id: r.id, when: stamp(r.started_at, tz), title: r.title ?? 'Conversation', transcript: (r.transcript ?? r.summary ?? '').slice(0, 7000) }))
      : []
    const out = await answer(llm, user.id, question.slice(0, 500), memories, clips, stamp(Date.now(), tz))
    // "remind me…" from the watch: the watch then tells the phone to re-sync its notifications
    if (out.moment) {
      await env.DB.prepare(insertMomentSql).bind(...momentRow(user.id, null, `ask:${crypto.randomUUID()}`, out.moment)).run()
      await fillIdeas(env, user).catch((err) => console.error('ideas failed', user.id, err))
    } else if (out.routine) {
      const r = out.routine
      await env.DB.prepare(`INSERT INTO routines (id, user_id, kind, title, days, time, question, created_at) VALUES (?, ?, 'time', ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), user.id, r.title, JSON.stringify(r.days), r.time, r.question, Date.now()).run()
    } else if (out.place) {
      await env.DB.prepare(`INSERT INTO routines (id, user_id, kind, title, place, leave, created_at) VALUES (?, ?, 'place', ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), user.id, out.place.title, out.place.place, out.place.leave ? 1 : 0, Date.now()).run()
    }
    if (out.moment || out.routine || out.place) return json({ answer: confirmation(out), sources: [], remembered: true })
    return json({ answer: out.answer, sources: await clipsById(env, user, out.clips) })
  }

  // GET /reminders → every notification the phone should have scheduled for the next 45 days
  if (req.method === 'GET' && parts[0] === 'reminders') {
    const today = localDay(Date.now(), tz)
    const [moments, { results: due }] = await Promise.all([
      openMoments(env, user),
      env.DB.prepare(`SELECT id, owner, counterpart, what, due_date, created_at FROM actions WHERE user_id = ? AND status = 'open' AND due_date >= ?`)
        .bind(user.id, addDays(today, -1)).all<Omit<DueAction, 'created_day'> & { created_at: number }>(),
    ])
    await fillAnswers(env, user, 24).catch((err) => console.error('routines failed', user.id, err))
    const now = stamp(Date.now(), tz).replace(' ', 'T')
    const [{ results: routines }, { results: errands }] = await Promise.all([
      env.DB.prepare('SELECT * FROM routines WHERE user_id = ?').bind(user.id).all<Routine & { kind: string; place: string | null; leave: number }>(),
      env.DB.prepare(`SELECT id, counterpart, what, place FROM actions WHERE user_id = ? AND status = 'open' AND owner = 'you' AND place IS NOT NULL`)
        .bind(user.id).all<{ id: string; counterpart: string | null; what: string; place: string }>(),
    ])
    const timed = routines.filter((r) => r.kind === 'time')
    // a routine with a question fires once with this run's answer; the phone re-syncs before the next
    const asked = timed.filter((r) => r.question).map((r) => {
      const at = nextRun(r, now)
      return { id: `t:${r.id}:${at}`, at, title: r.title, body: r.answer_for === at && r.answer ? r.answer : `Ask your watch: ${r.question}` }
    })
    return json({
      reminders: [...reminders(moments, due.map((a) => ({ ...a, created_day: localDay(a.created_at, tz) })), today), ...asked].sort((a, b) => a.at.localeCompare(b.at)),
      repeating: timed.filter((r) => !r.question).map((r) => ({ id: `t:${r.id}`, weekdays: iosWeekdays(JSON.parse(r.days)), time: r.time, title: r.title })),
      places: [
        ...routines.filter((r) => r.kind === 'place').map((r) => ({ id: `p:${r.id}`, title: r.title, body: '', place: r.place, leave: !!r.leave })),
        ...errands.map((a) => ({ id: `p:${a.id}`, title: a.what.charAt(0).toUpperCase() + a.what.slice(1), body: a.counterpart ? `You told ${a.counterpart} you would.` : 'You said you would.', place: a.place, leave: false })),
      ],
    })
  }

  // GET /routines   DELETE /routines/:id
  if (parts[0] === 'routines') {
    if (req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, kind, title, days, time, question, place, leave FROM routines WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all()
      return json({ routines: results })
    }
    if (req.method === 'DELETE' && parts[1]) {
      const { meta } = await env.DB.prepare('DELETE FROM routines WHERE id = ? AND user_id = ?').bind(parts[1], user.id).run()
      return meta.changes ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }
  }

  // GET /moments → upcoming dated things, soonest first   DELETE /moments/:id — forget one
  if (parts[0] === 'moments') {
    if (req.method === 'GET') {
      const today = localDay(Date.now(), tz)
      const list = (await openMoments(env, user)).map((m) => ({ ...m, next: nextOccurrence(m, today) })).filter((m) => m.next)
      return json({ moments: list.sort((a, b) => a.next!.localeCompare(b.next!)) })
    }
    if (req.method === 'DELETE' && parts[1]) {
      const { meta } = await env.DB.prepare('DELETE FROM moments WHERE id = ? AND user_id = ?').bind(parts[1], user.id).run()
      return meta.changes ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }
  }

  // POST /prep { title, attendees: [names] } → pre-meeting card (memory + promises + Tavily news)
  if (req.method === 'POST' && parts[0] === 'prep') {
    const { title, attendees = [] } = await req.json<{ title: string; attendees?: string[] }>()
    if (!title?.trim()) return json({ error: 'title required' }, 400)
    const names = attendees.map((a) => a.trim()).filter(Boolean).slice(0, 6)
    const memories = dedupe((await Promise.all([title, ...names].map((q) => searchMemories(env, user, q, 6)))).flat())
    const actions = (await openActionLines(env, user)).filter((l) => !names.length || names.some((n) => l.toLowerCase().includes(n.split(' ')[0].toLowerCase())))
    const orgs = await orgsFor(env, user, names)
    const news = (await Promise.all(orgs.slice(0, 2).map((o) => tavilySearch(env.TAVILY_API_KEY, `${o} news`).catch(() => [])))).flat().slice(0, 4)
    return json(await prepCard(llmEnv(env, user), user.id, `${title}${names.length ? ` with ${names.join(', ')}` : ''}`, memories, actions, news))
  }

  // GET /actions?status=open   PATCH /actions/:id { status?, draft? }
  if (parts[0] === 'actions') {
    if (req.method === 'GET') {
      const status = url.searchParams.get('status') ?? 'open'
      const { results } = await env.DB.prepare(
        `SELECT a.*, r.title AS recording_title, r.started_at AS recording_started_at FROM actions a
         LEFT JOIN recordings r ON r.id = a.recording_id WHERE a.user_id = ? AND a.status = ? ORDER BY a.created_at DESC LIMIT 100`
      ).bind(user.id, status).all()
      return json({ actions: results })
    }
    if (req.method === 'PATCH' && parts[1]) {
      const body = await req.json<{ status?: string; draft?: string }>()
      if (body.status && !['open', 'done', 'dismissed'].includes(body.status)) return json({ error: 'bad status' }, 400)
      const { meta } = await env.DB.prepare('UPDATE actions SET status = COALESCE(?, status), draft = COALESCE(?, draft), updated_at = ? WHERE id = ? AND user_id = ?')
        .bind(body.status ?? null, body.draft ?? null, Date.now(), parts[1], user.id).run()
      return meta.changes ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }
  }

  // GET /briefs?limit=7   POST /briefs/run { day? } (default: yesterday) — the nightly job, on demand
  if (parts[0] === 'briefs') {
    if (req.method === 'GET') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 7), 30)
      const { results } = await env.DB.prepare('SELECT day, content, sources, created_at FROM briefs WHERE user_id = ? ORDER BY day DESC LIMIT ?').bind(user.id, limit).all()
      return json({ briefs: results })
    }
    if (req.method === 'POST' && parts[1] === 'run') {
      const { day } = await req.json<{ day?: string }>().catch(() => ({ day: undefined }))
      if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'day must be YYYY-MM-DD' }, 400)
      return json(await runBrief(env, user, day ?? localDay(Date.now() - 86_400_000, tz)))
    }
  }

  // GET /usage?days=14 → dollars per day per model (Token Factory + Deepgram)
  if (req.method === 'GET' && parts[0] === 'usage' && !parts[1]) {
    const days = Math.min(Number(url.searchParams.get('days') ?? 14), 90)
    const { results } = await env.DB.prepare(
      `SELECT ts, model, input_tokens, output_tokens, cost_usd FROM usage WHERE user_id = ? AND ts > ?`
    ).bind(user.id, Date.now() - days * 86_400_000).all<{ ts: number; model: string; input_tokens: number; output_tokens: number; cost_usd: number }>()
    // Grouped here, not in SQL: "day" is the user's local day, and SQLite has no timezones.
    const groups = new Map<string, { day: string; model: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }>()
    for (const r of results) {
      const day = localDay(r.ts, tz)
      const g = groups.get(`${day}|${r.model}`) ?? { day, model: r.model, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }
      g.calls++, (g.input_tokens += r.input_tokens), (g.output_tokens += r.output_tokens), (g.cost_usd += r.cost_usd)
      groups.set(`${day}|${r.model}`, g)
    }
    return json({ usage: [...groups.values()].sort((a, b) => b.day.localeCompare(a.day) || a.model.localeCompare(b.model)) })
  }

  // GET /usage/calls?limit=50 → the per-call trace: model, purpose, tokens, latency, cost
  if (req.method === 'GET' && parts[0] === 'usage' && parts[1] === 'calls') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const { results } = await env.DB.prepare('SELECT ts, model, purpose, input_tokens, output_tokens, cost_usd, latency_ms FROM usage WHERE user_id = ? ORDER BY ts DESC LIMIT ?').bind(user.id, limit).all()
    return json({ calls: results })
  }

  // GET /export → everything Earshot holds about you, as one JSON file
  if (req.method === 'GET' && parts[0] === 'export') {
    const [recordings, actions, briefs, moments, routines] = await Promise.all(
      ['recordings', 'actions', 'briefs', 'moments', 'routines'].map((t) => env.DB.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).bind(user.id).all().then((r) => r.results)),
    )
    const memories = await allMemories(env, user)
    return new Response(JSON.stringify({ exported_at: new Date().toISOString(), profile: publicUser(user), recordings, actions, briefs, moments, routines, memories }, null, 2), {
      headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="earshot-export-${localDay(Date.now(), tz)}.json"` },
    })
  }

  // GET /me   PATCH /me { name?, tz?, retention_days? }   DELETE /me — erase the account's data everywhere
  if (parts[0] === 'me' && !parts[1]) {
    if (req.method === 'GET') return json(publicUser(user))
    if (user.id === LEGACY_ID) return json({ error: 'This account is configured in wrangler.jsonc' }, 400)
    if (req.method === 'PATCH') {
      const body = await req.json<{ name?: string; tz?: string; retention_days?: number }>()
      if (body.tz !== undefined && !validTz(body.tz)) return json({ error: 'Unknown timezone' }, 400)
      if (body.retention_days !== undefined && !(Number.isInteger(body.retention_days) && body.retention_days >= 7 && body.retention_days <= 3650))
        return json({ error: 'retention_days must be 7–3650' }, 400)
      await env.DB.prepare('UPDATE users SET name = COALESCE(?, name), tz = COALESCE(?, tz), retention_days = COALESCE(?, retention_days) WHERE id = ?')
        .bind(body.name?.trim().slice(0, 60) || null, body.tz ?? null, body.retention_days ?? null, user.id).run()
      return json(publicUser((await getUser(env, user.id))!))
    }
    if (req.method === 'DELETE') {
      const wiped = await memoryhq(env, user, `/end-users/${encodeURIComponent(user.id)}`, undefined, 'DELETE')
      if (!wiped.ok) return json({ error: `Could not erase memories (MemoryHQ ${wiped.status})` }, 502)
      const { results: keys } = await env.DB.prepare('SELECT r2_key FROM recordings WHERE user_id = ?').bind(user.id).all<{ r2_key: string }>()
      if (keys.length) await env.AUDIO.delete(keys.map((k) => k.r2_key))
      await env.DB.batch(
        ['recordings', 'actions', 'moments', 'routines', 'briefs', 'usage', 'devices', 'pair_codes'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(user.id))
          .concat(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id)),
      )
      return json({ ok: true })
    }
  }

  // GET /devices   POST /devices/pair-code → { code, expires_at }   DELETE /devices/:id
  if (parts[0] === 'devices') {
    if (req.method === 'GET' && !parts[1]) {
      const { results } = await env.DB.prepare('SELECT id, name, created_at, last_seen_at FROM devices WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all()
      return json({ devices: results })
    }
    if (req.method === 'POST' && parts[1] === 'pair-code') {
      if (user.id === LEGACY_ID) return json({ error: 'Pairing needs a website account' }, 400)
      const { challenge } = await req.json<{ challenge?: string }>().catch(() => ({}) as { challenge?: string })
      if (challenge !== undefined && !/^[0-9a-f]{64}$/.test(challenge)) return json({ error: 'Bad challenge' }, 400)
      const bytes = crypto.getRandomValues(new Uint8Array(8))
      const raw = [...bytes].map((b) => PAIR_ALPHABET[b % PAIR_ALPHABET.length]).join('')
      const expiresAt = Date.now() + PAIR_TTL_MS
      await env.DB.batch([
        env.DB.prepare('DELETE FROM pair_codes WHERE user_id = ? OR expires_at < ?').bind(user.id, Date.now()),
        env.DB.prepare('INSERT INTO pair_codes (code_hash, user_id, expires_at, challenge) VALUES (?, ?, ?, ?)').bind(await sha256(raw), user.id, expiresAt, challenge ?? null),
      ])
      return json({ code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expires_at: expiresAt })
    }
    if (req.method === 'DELETE' && parts[1]) {
      const { meta } = await env.DB.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').bind(parts[1], user.id).run()
      return meta.changes ? json({ ok: true }) : json({ error: 'Not found' }, 404)
    }
  }

  return json({ error: 'Not found' }, 404)
}

// Who is calling: the website (service binding + shared secret, acting for a signed-in user),
// a paired iPhone/watch (device token), or the legacy single-user token.
async function authenticate(req: Request, env: Env): Promise<User | null> {
  const internal = req.headers.get('x-earshot-internal')
  if (internal && env.INTERNAL_SECRET && timingSafeEqual(internal, env.INTERNAL_SECRET)) {
    const id = req.headers.get('x-earshot-user')
    if (!id) return null
    return ensureUser(env, id, decodeURIComponent(req.headers.get('x-earshot-user-name') ?? ''), req.headers.get('x-earshot-user-email'))
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  if (env.APP_TOKEN && timingSafeEqual(token, env.APP_TOKEN)) return legacyUser(env)
  const device = await env.DB.prepare('SELECT id, user_id, last_seen_at FROM devices WHERE token_hash = ?').bind(await sha256(token)).first<{ id: string; user_id: string; last_seen_at: number | null }>()
  if (!device) return null
  if (!device.last_seen_at || Date.now() - device.last_seen_at > 5 * 60_000) {
    await env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(Date.now(), device.id).run()
  }
  return getUser(env, device.user_id)
}

async function getUser(env: Env, id: string): Promise<User | null> {
  if (id === LEGACY_ID) return env.APP_TOKEN ? legacyUser(env) : null
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>()
}

// First visit from the website: create the user. Their memory needs no setup: it lives under
// their id as an end user of Earshot's MemoryHQ workspace.
async function ensureUser(env: Env, id: string, name: string, email: string | null): Promise<User> {
  let user = await getUser(env, id)
  if (!user) {
    await env.DB.prepare('INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, email, name.split(' ')[0] || null, Date.now()).run()
    user = (await getUser(env, id))!
  }
  return user
}

function legacyUser(env: Env): User {
  return {
    id: LEGACY_ID, email: null, name: env.USER_NAME ?? null, tz: env.TZ ?? 'UTC', retention_days: Number(env.RETENTION_DAYS ?? 30),
    daily_usd_cap: Number(env.DAILY_USD_CAP ?? 1), created_at: 0,
  }
}

const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, tz: u.tz, retention_days: u.retention_days, daily_usd_cap: u.daily_usd_cap, created_at: u.created_at })

const llmEnv = (env: Env, user: User): LlmEnv & { TAVILY_API_KEY: string } => ({
  NEBIUS_API_KEY: env.NEBIUS_API_KEY, TAVILY_API_KEY: env.TAVILY_API_KEY, DB: env.DB, USER_NAME: user.name ?? undefined, DAILY_USD_CAP: String(user.daily_usd_cap),
})

async function processRecording(env: Env, id: string) {
  const rec = await env.DB.prepare('SELECT * FROM recordings WHERE id = ?').bind(id).first<Recording>()
  if (!rec || rec.status === 'done' || rec.status === 'empty') return
  const user = await getUser(env, rec.user_id)
  if (!user) return // account deleted while queued
  const llm = llmEnv(env, user)

  // Each stage saves its output, so a retry after a later failure doesn't redo (or re-bill) it.
  let transcript = rec.transcript
  if (transcript == null) {
    const obj = await env.AUDIO.get(rec.r2_key)
    if (!obj) throw new Error('audio missing from R2')
    const out = (await env.AI.run('@cf/deepgram/nova-3' as any, {
      audio: { body: obj.body, contentType: obj.httpMetadata?.contentType ?? 'audio/mp4' },
      diarize: true,
      smart_format: true,
      punctuate: true,
      utterances: true,
      // Code-switching mid-sentence (Hindi/English is the norm on real clips). detect_language picked ONE
      // language per clip and dropped the other. Same Workers AI price per minute.
      // ponytail: 'multi' covers 10 languages; swap back to detect_language for a user whose language isn't one of them.
      language: 'multi',
    } as any)) as any
    transcript = formatTranscript(out)
    await setFields(env, id, { transcript })
    await env.DB.prepare('INSERT INTO usage (ts, user_id, model, purpose, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, 0, 0, ?)')
      .bind(Date.now(), rec.user_id, 'deepgram/nova-3', 'transcribe', (rec.duration_ms / 60_000) * DEEPGRAM_USD_PER_MIN).run()
    // Privacy: the audio is gone the moment we have words. Nothing re-listens later.
    if (!env.KEEP_AUDIO?.split(',').includes(rec.user_id)) await env.AUDIO.delete(rec.r2_key)
  }

  if (wordCount(transcript) < MIN_WORDS) {
    await setFields(env, id, { status: 'empty' })
    return
  }

  const when = stamp(rec.started_at, user.tz)
  let facts: string[] = []
  if (rec.summary == null) {
    // Clips rotate every 10 minutes, so a call or a film runs across several: give the previous one as context.
    const prev = await env.DB.prepare(
      `SELECT transcript, entities FROM recordings WHERE user_id = ? AND started_at < ? AND started_at > ? AND transcript IS NOT NULL ORDER BY started_at DESC LIMIT 1`
    ).bind(rec.user_id, rec.started_at, rec.started_at - 30 * 60_000).first<{ transcript: string; entities: string | null }>()
    // Only the transcript's end: given the previous summary too, the model retells it.
    const prevScreen = prev && (JSON.parse(prev.entities ?? '{}') as { screen?: string }).screen
    const before = prev && `${prevScreen ? `(${prevScreen} was playing.)\n` : ''}${prev.transcript.slice(-4000)}`
    const x = await extractClip(llm, rec.user_id, transcript, when, before || undefined, rec.music, rec.ambient)
    facts = x.facts
    // Action ids are derived from the clip → a retry re-inserts nothing.
    const stmts: D1PreparedStatement[] = []
    for (const [i, c] of x.commitments.entries()) {
      const mine = c.owner.trim().toLowerCase() === 'you'
      const draft = mine ? await draftFollowUp(llm, rec.user_id, c, x.summary) : null
      stmts.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO actions (id, user_id, recording_id, owner, counterpart, what, due, due_date, place, draft, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
        ).bind(`${id}:${i}`, rec.user_id, id, mine ? 'you' : c.owner, c.counterpart ?? null, c.what, c.due ?? null, c.due_date ?? null, c.place ?? null, draft, Date.now(), Date.now()),
      )
    }
    for (const [i, m] of x.moments.entries()) stmts.push(env.DB.prepare(insertMomentSql).bind(...momentRow(rec.user_id, id, `${id}:m${i}`, m)))
    if (stmts.length) await env.DB.batch(stmts)
    if (x.moments.length) await fillIdeas(env, user).catch((err) => console.error('ideas failed', user.id, err))
    // Facts ride along in entities until written to MemoryHQ, so a MemoryHQ failure doesn't re-run extraction.
    await setFields(env, id, { title: x.title, summary: x.summary, entities: JSON.stringify({ people: x.people, orgs: x.orgs, facts: x.facts, screen: x.screen }) })
  } else {
    facts = (JSON.parse(rec.entities ?? '{}') as { facts?: string[] }).facts ?? []
  }

  // Nemotron already decided what's worth keeping → MemoryHQ stores each fact verbatim (infer: false),
  // tagged with time + clip id so answers can cite the conversation.
  const ids: string[] = []
  for (const fact of facts) {
    const res = await memoryhq(env, user, '/memories', { scope: 'user', infer: false, content: `[${when} · clip ${id}] ${fact}` })
    if (!res.ok) throw new Error(`MemoryHQ ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as { added?: { id: string }[] }
    ids.push(...(body.added ?? []).map((m) => m.id))
  }
  await setFields(env, id, { status: 'done', memories_added: ids.length, memory_ids: JSON.stringify(ids), error: null })
}

// Nightly: Tavily news for the day's companies (written back to memory), then Nemotron Ultra writes the brief.
async function runBrief(env: Env, user: User, day: string) {
  const tz = user.tz
  const start = dayStart(day, tz)
  const { results: clips } = await env.DB.prepare(
    `SELECT id, started_at, title, summary, transcript, entities FROM recordings
     WHERE user_id = ? AND status = 'done' AND started_at >= ? AND started_at < ? ORDER BY started_at`
  ).bind(user.id, start, start + 86_400_000).all<Pick<Recording, 'id' | 'started_at' | 'title' | 'summary' | 'transcript' | 'entities'>>()
  if (!clips.length) return { day, skipped: 'no conversations' }

  const llm = llmEnv(env, user)
  const orgs = clips.flatMap((c) => {
    const e = JSON.parse(c.entities ?? '{}') as Partial<Entities>
    return [...(e.orgs ?? []), ...(e.people ?? []).map((p) => p.org).filter(Boolean)] as string[]
  })
  const summaries = clips.map((c) => `- ${stamp(c.started_at, tz)} ${c.title}: ${c.summary ?? ''}`)
  const news = env.TAVILY_API_KEY ? await research(llm, user.id, day, summaries, orgs) : []
  for (const n of news) {
    await memoryhq(env, user, '/memories', {
      scope: 'user',
      infer: false,
      content: `[news ${n.published_date?.slice(0, 10) ?? day}] ${n.org}: ${n.content} (source: ${n.url})`,
    })
  }

  const content = await morningBrief(
    llm,
    user.id,
    day,
    clips.map((c) => ({ when: stamp(c.started_at, tz), title: c.title ?? 'Conversation', transcript: c.transcript ?? '' })),
    await openActionLines(env, user),
    news,
    (await openMoments(env, user)).flatMap((m) => {
      const next = nextOccurrence(m, day)
      return next && next <= addDays(day, 14) ? [`- ${next}: ${m.title}${m.prep ? ` (${m.prep})` : ''}`] : []
    }),
  )
  const sources = news.map((n, i) => ({ n: i + 1, title: n.title, url: n.url, org: n.org }))
  await env.DB.prepare('INSERT OR REPLACE INTO briefs (user_id, day, content, sources, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, day, content, JSON.stringify(sources), Date.now()).run()
  return { day, content, sources }
}

async function searchMemories(env: Env, user: User, query: string, limit: number): Promise<{ id: string; content: string }[]> {
  const res = await memoryhq(env, user, '/memories/search', { query, scope: 'user', limit })
  if (!res.ok) throw new Error(`MemoryHQ search ${res.status}`)
  return ((await res.json()) as { memories?: { id: string; content: string }[] }).memories ?? []
}

async function allMemories(env: Env, user: User): Promise<unknown[]> {
  const memories: unknown[] = []
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = (await (await memoryhq(env, user, `/memories?scope=user&limit=100&offset=${offset}`)).json()) as { memories?: unknown[] }
    memories.push(...(page.memories ?? []))
    if ((page.memories?.length ?? 0) < 100) break
  }
  return memories
}

// Same moment heard again → INSERT OR IGNORE on (user_id, dedupe) keeps the first.
const insertMomentSql = `INSERT OR IGNORE INTO moments (id, user_id, recording_id, dedupe, kind, title, person, date, time, yearly, prep, lead_days, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
const momentRow = (userId: string, recordingId: string | null, id: string, m: MomentInput) =>
  [id, userId, recordingId, dedupeKey(m), m.kind, m.title, m.person, m.date, m.time, m.yearly ? 1 : 0, m.prep, JSON.stringify(m.lead_days), Date.now()]

const openMoments = async (env: Env, user: User) =>
  (await env.DB.prepare(`SELECT id, kind, title, person, date, time, yearly, prep, lead_days, ideas, ideas_for FROM moments WHERE user_id = ? AND status = 'open'`)
    .bind(user.id).all<Moment>()).results

// Moments needing prep in the next two weeks get ideas from what was said about them (once per occurrence).
async function fillIdeas(env: Env, user: User) {
  const today = localDay(Date.now(), user.tz)
  for (const m of await openMoments(env, user)) {
    const next = nextOccurrence(m, today)
    if (!m.prep || !next || next > addDays(today, 14) || m.ideas_for === next) continue
    const memories = await searchMemories(env, user, `${m.person ?? ''} ${m.title} likes wants gift`.trim(), 10)
    const ideas = await prepIdeas(llmEnv(env, user), user.id, { title: m.title, prep: m.prep }, next, memories)
    await env.DB.prepare('UPDATE moments SET ideas = ?, ideas_for = ? WHERE id = ?').bind(ideas, next, m.id).run()
  }
}

// Routines with a question whose next run is within `hours` get this run's answer written (once per run).
async function fillAnswers(env: Env, user: User, hours: number) {
  const { results } = await env.DB.prepare(`SELECT * FROM routines WHERE user_id = ? AND kind = 'time' AND question IS NOT NULL`).bind(user.id).all<Routine>()
  const now = stamp(Date.now(), user.tz).replace(' ', 'T')
  const until = stamp(Date.now() + hours * 3_600_000, user.tz).replace(' ', 'T')
  const due = results.map((r) => ({ r, at: nextRun(r, now) })).filter(({ r, at }) => at <= until && r.answer_for !== at)
  if (!due.length) return
  const today = localDay(Date.now(), user.tz)
  const [actions, moments, { results: week }] = await Promise.all([
    openActionLines(env, user),
    openMoments(env, user),
    env.DB.prepare(`SELECT started_at, title, summary FROM recordings WHERE user_id = ? AND status = 'done' AND started_at > ? ORDER BY started_at`)
      .bind(user.id, Date.now() - 7 * 86_400_000).all<{ started_at: number; title: string | null; summary: string | null }>(),
  ])
  const upcoming = moments.flatMap((m) => {
    const next = nextOccurrence(m, today)
    return next && next <= addDays(today, 14) ? [`- ${next}: ${m.title}${m.prep ? ` (${m.prep})` : ''}`] : []
  })
  const summaries = week.map((c) => `- ${stamp(c.started_at, user.tz)} ${c.title ?? ''}: ${c.summary ?? ''}`)
  for (const { r, at } of due) {
    const answer = await routineAnswer(llmEnv(env, user), user.id, r.question!, at, actions, upcoming, summaries)
    await env.DB.prepare('UPDATE routines SET answer = ?, answer_for = ? WHERE id = ?').bind(answer, at, r.id).run()
  }
}

const dedupe = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()]

async function openActionLines(env: Env, user: User): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT owner, counterpart, what, due FROM actions WHERE user_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 40`)
    .bind(user.id).all<{ owner: string; counterpart: string | null; what: string; due: string | null }>()
  return results.map((a) => `- ${a.owner === 'you' ? 'You' : a.owner} → ${a.counterpart ?? '?'}: ${a.what}${a.due ? ` (due ${a.due})` : ''}`)
}

async function clipsById(env: Env, user: User, ids: string[]) {
  if (!ids.length) return []
  const { results } = await env.DB.prepare(`SELECT id, started_at, title FROM recordings WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(user.id, ...ids).all()
  return results
}

// Companies of the people you're meeting, as heard in past conversations.
async function orgsFor(env: Env, user: User, names: string[]): Promise<string[]> {
  if (!names.length) return []
  const { results } = await env.DB.prepare(`SELECT entities FROM recordings WHERE user_id = ? AND entities IS NOT NULL ORDER BY started_at DESC LIMIT 300`)
    .bind(user.id).all<{ entities: string }>()
  const firsts = names.map((n) => n.split(' ')[0].toLowerCase())
  const orgs = new Set<string>()
  for (const r of results) {
    for (const p of (JSON.parse(r.entities) as Partial<Entities>).people ?? []) {
      if (p.org && firsts.includes(p.name.split(' ')[0].toLowerCase())) orgs.add(p.org)
    }
  }
  return [...orgs]
}

function memoryhq(env: Env, user: User, path: string, body?: unknown, method = body ? 'POST' : 'GET') {
  if (!env.MEMORYHQ_WORKSPACE || !env.MEMORYHQ_KEY) throw new Error('MEMORYHQ_WORKSPACE / MEMORYHQ_KEY not set')
  const headers: Record<string, string> = { 'x-api-key': env.MEMORYHQ_KEY, 'content-type': 'application/json' }
  // The single-user token keeps the key's own (member) memory, as before end users existed.
  if (user.id !== LEGACY_ID) headers['x-end-user-id'] = user.id
  return env.MEMORYHQ.fetch(`${env.MEMORYHQ_URL}/api/${env.MEMORYHQ_WORKSPACE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function setFields(env: Env, id: string, fields: Record<string, string | number | null>) {
  const keys = Object.keys(fields)
  await env.DB.prepare(`UPDATE recordings SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), Date.now(), id)
    .run()
}

async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
