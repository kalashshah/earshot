import { formatTranscript, wordCount } from './transcript'

interface Env {
  DB: D1Database
  AUDIO: R2Bucket
  AI: Ai
  PROCESS: Queue<{ id: string }>
  APP_TOKEN: string
  MEMORYHQ: Fetcher
  MEMORYHQ_URL: string
  MEMORYHQ_WORKSPACE: string
  MEMORYHQ_KEY: string
}

type Recording = {
  id: string; user_id: string; started_at: number; duration_ms: number; bytes: number; r2_key: string
  status: string; title: string | null; summary: string | null; transcript: string | null
  memories_added: number; error: string | null; created_at: number; updated_at: number
}

// ponytail: single shared APP_TOKEN → one user. Swap for per-device tokens in a table when
// there's a second user; every row already carries user_id.
const USER_ID = 'me'
const MAX_BYTES = 50 * 1024 * 1024
const MIN_WORDS = 8 // below this a clip is noise / a cough / "hm", not a conversation

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/health') return json({ ok: true })
    if (req.headers.get('authorization') !== `Bearer ${env.APP_TOKEN}`) return json({ error: 'Unauthorized' }, 401)

    const parts = url.pathname.split('/').filter(Boolean)

    // PUT /recordings/:id  body = audio (id minted on the watch → idempotent), headers x-started-at (ms), x-duration-ms
    if (req.method === 'PUT' && parts[0] === 'recordings' && parts[1]) {
      const id = parts[1]
      if (!/^[0-9A-Fa-f-]{36}$/.test(id)) return json({ error: 'id must be a UUID' }, 400)
      const startedAt = Number(req.headers.get('x-started-at'))
      const durationMs = Number(req.headers.get('x-duration-ms') ?? 0)
      if (!Number.isFinite(startedAt) || startedAt <= 0) return json({ error: 'x-started-at required' }, 400)
      const contentType = req.headers.get('content-type') ?? 'audio/mp4'
      const len = Number(req.headers.get('content-length') ?? 0)
      if (len > MAX_BYTES) return json({ error: 'Too large' }, 413)

      const existing = await env.DB.prepare('SELECT status FROM recordings WHERE id = ?').bind(id).first()
      if (existing) return json({ id, status: existing.status }) // retried upload

      const key = `${USER_ID}/${id}.m4a`
      const obj = await env.AUDIO.put(key, req.body, { httpMetadata: { contentType } })
      const now = Date.now()
      await env.DB.prepare(
        `INSERT OR IGNORE INTO recordings (id, user_id, started_at, duration_ms, bytes, r2_key, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`
      ).bind(id, USER_ID, startedAt, durationMs, obj.size, key, now, now).run()
      await env.PROCESS.send({ id })
      return json({ id, status: 'queued' }, 202)
    }

    // GET /recordings?before=<started_at ms>&limit=30   (newest first, keyset paginated)
    if (req.method === 'GET' && parts[0] === 'recordings' && !parts[1]) {
      const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER)
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100)
      const { results } = await env.DB.prepare(
        `SELECT id, started_at, duration_ms, status, title, summary, transcript, memories_added
         FROM recordings WHERE user_id = ? AND started_at < ? AND status != 'empty'
         ORDER BY started_at DESC LIMIT ?`
      ).bind(USER_ID, before, limit).all()
      return json({ recordings: results })
    }

    // POST /recordings/:id/retry — re-run a failed recording (finished stages are kept)
    if (req.method === 'POST' && parts[0] === 'recordings' && parts[2] === 'retry') {
      const { meta } = await env.DB.prepare(`UPDATE recordings SET status = 'queued', error = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'failed'`)
        .bind(Date.now(), parts[1], USER_ID).run()
      if (!meta.changes) return json({ error: 'Not a failed recording' }, 409)
      await env.PROCESS.send({ id: parts[1] })
      return json({ id: parts[1], status: 'queued' }, 202)
    }

    if (req.method === 'DELETE' && parts[0] === 'recordings' && parts[1]) {
      const row = await env.DB.prepare('SELECT r2_key FROM recordings WHERE id = ? AND user_id = ?').bind(parts[1], USER_ID).first<{ r2_key: string }>()
      if (!row) return json({ error: 'Not found' }, 404)
      await env.AUDIO.delete(row.r2_key)
      await env.DB.prepare('DELETE FROM recordings WHERE id = ?').bind(parts[1]).run()
      return json({ ok: true })
    }

    // GET /memories?offset=0&limit=50 → MemoryHQ (the key never leaves the server)
    if (req.method === 'GET' && parts[0] === 'memories') {
      const q = new URLSearchParams({ scope: 'user', limit: url.searchParams.get('limit') ?? '50', offset: url.searchParams.get('offset') ?? '0' })
      const res = await memoryhq(env, `/memories?${q}`)
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
    }

    // POST /memories/search { query }
    if (req.method === 'POST' && parts[0] === 'memories' && parts[1] === 'search') {
      const { query } = await req.json<{ query: string }>()
      const res = await memoryhq(env, '/memories/search', { query, scope: 'all', limit: 20 })
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
    }

    return json({ error: 'Not found' }, 404)
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
} satisfies ExportedHandler<Env, { id: string }>

async function processRecording(env: Env, id: string) {
  const rec = await env.DB.prepare('SELECT * FROM recordings WHERE id = ?').bind(id).first<Recording>()
  if (!rec || rec.status === 'done' || rec.status === 'empty') return
  const obj = await env.AUDIO.get(rec.r2_key)
  if (!obj) throw new Error('audio missing from R2')

  // Each stage saves its output, so a retry after a later failure doesn't redo (or re-bill) it.
  let transcript = rec.transcript
  if (transcript == null) {
    const out = (await env.AI.run('@cf/deepgram/nova-3' as any, {
      audio: { body: obj.body, contentType: obj.httpMetadata?.contentType ?? 'audio/mp4' },
      diarize: true,
      smart_format: true,
      punctuate: true,
      utterances: true,
      detect_language: true,
    } as any)) as any
    transcript = formatTranscript(out)
    await setFields(env, id, { transcript })
  }

  if (wordCount(transcript) < MIN_WORDS) {
    await setFields(env, id, { status: 'empty' })
    return
  }

  if (rec.summary == null) {
    const { title, summary } = await summarize(env, transcript)
    await setFields(env, id, { title, summary })
  }

  const when = new Date(rec.started_at).toISOString()
  const res = await memoryhq(env, '/memories', {
    scope: 'user',
    content: `Conversation recorded by the user's Apple Watch at ${when}. "Speaker 0" is most likely the user (the wearer).\n\n${transcript}`,
  })
  if (!res.ok && res.status !== 202) throw new Error(`MemoryHQ ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as { added?: unknown[]; updated?: number }
  await setFields(env, id, { status: 'done', memories_added: (body.added?.length ?? 0) + (body.updated ?? 0), error: null })
}

async function summarize(env: Env, transcript: string): Promise<{ title: string; summary: string }> {
  const out = (await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      {
        role: 'system',
        content:
          'You summarize transcripts of real conversations captured by a wearable. Reply with JSON only: {"title": "<4-8 word title>", "summary": "<1-3 sentences: who talked about what, any decisions, plans or to-dos>"}. Speaker 0 is usually the wearer; call them "you".',
      },
      { role: 'user', content: transcript.slice(0, 24000) },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 300,
  } as any)) as any
  const raw = out.response
  const parsed = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') : raw ?? {}
  return { title: String(parsed.title ?? 'Conversation').slice(0, 120), summary: String(parsed.summary ?? '').slice(0, 1000) }
}

function memoryhq(env: Env, path: string, body?: unknown) {
  return env.MEMORYHQ.fetch(`${env.MEMORYHQ_URL}/api/${env.MEMORYHQ_WORKSPACE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-api-key': env.MEMORYHQ_KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function setFields(env: Env, id: string, fields: Record<string, string | number | null>) {
  const keys = Object.keys(fields)
  await env.DB.prepare(`UPDATE recordings SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), Date.now(), id)
    .run()
}
