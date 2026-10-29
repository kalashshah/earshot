// Nebius Token Factory (OpenAI-compatible) — every model call in Earshot goes through here.
export const MODELS = {
  lightning: 'nvidia/Nemotron-3_5-Lightning',       // wrist answers, search planning, condensing pages
  super: 'nvidia/nemotron-3-super-120b-a12b',       // per-clip extraction, drafting follow-ups, meeting prep
  ultra: 'nvidia/Nemotron-3-Ultra-550b-a55b',       // nightly whole-day reflection (1M context)
} as const
export type Model = (typeof MODELS)[keyof typeof MODELS]

// $ per 1M tokens [input, output], Token Factory list prices 2026-10-14.
const PRICE: Record<string, [number, number]> = {
  [MODELS.lightning]: [0.06, 0.24],
  [MODELS.super]: [0.3, 0.9],
  [MODELS.ultra]: [1, 3],
}
export const costUsd = (model: string, input: number, output: number) => {
  const [i, o] = PRICE[model] ?? [0, 0]
  return (input * i + output * o) / 1e6
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }
export type LlmEnv = { NEBIUS_API_KEY: string; DB: D1Database; DAILY_USD_CAP?: string; USER_NAME?: string }

export async function chat(
  env: LlmEnv,
  opts: { model: Model; messages: Msg[]; json?: boolean; maxTokens?: number; thinking?: boolean; purpose: string; userId: string },
): Promise<string> {
  // Per-user daily spend cap: fixed credits must survive judging (Dec 1–15) and any runaway loop.
  // Model spend only: transcription is already paid by then, and counting it (~$2.50 for 8 h of audio) would
  // leave a full day's clips transcribed but never turned into memories.
  if (env.DAILY_USD_CAP) {
    const spent = await env.DB.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS s FROM usage WHERE user_id = ? AND ts > ? AND model NOT LIKE 'deepgram/%'`).bind(opts.userId, Date.now() - 86_400_000).first<number>('s')
    if ((spent ?? 0) >= Number(env.DAILY_USD_CAP)) throw new Error('Daily model budget reached, try again tomorrow')
  }
  const t0 = Date.now()
  const res = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.NEBIUS_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 1500,
      temperature: opts.thinking ? 0.6 : 0.2,
      // Nemotron's hidden reasoning eats max_tokens and breaks JSON mode → off unless asked for.
      chat_template_kwargs: { enable_thinking: !!opts.thinking },
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Token Factory ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const out = (await res.json()) as any
  const input = out.usage?.prompt_tokens ?? 0
  const output = out.usage?.completion_tokens ?? 0
  await env.DB.prepare('INSERT INTO usage (ts, user_id, model, purpose, input_tokens, output_tokens, cost_usd, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(Date.now(), opts.userId, opts.model, opts.purpose, input, output, costUsd(opts.model, input, output), Date.now() - t0)
    .run()
  const text: string = out.choices?.[0]?.message?.content ?? ''
  if (out.choices?.[0]?.finish_reason === 'length' && opts.json) throw new Error(`${opts.model} hit max_tokens before finishing JSON`)
  return text
}

// Pull the first JSON object out of a reply (tolerates ```json fences and stray prose).
export function parseJson<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error(`no JSON in model reply: ${text.slice(0, 200)}`)
  return JSON.parse(m[0]) as T
}

export type Tavily = { title: string; url: string; content: string; published_date?: string; score?: number }

async function tavily<T>(apiKey: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.tavily.com/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Tavily ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<T>
}

export async function tavilySearch(apiKey: string, query: string, topic: 'news' | 'general' = 'news'): Promise<Tavily[]> {
  const out = await tavily<{ results?: Tavily[] }>(apiKey, 'search', {
    query, topic, search_depth: 'advanced', chunks_per_source: 3, max_results: 4, ...(topic === 'news' ? { days: 14 } : {}),
  })
  return (out.results ?? []).filter((r) => r.content?.trim()).map((r) => ({ ...r, content: r.content.slice(0, 800) }))
}

// Full page text for the best hits, focused on what we asked about. Empty pages are dropped, never stored.
export async function tavilyExtract(apiKey: string, urls: string[], query: string): Promise<Map<string, string>> {
  if (!urls.length) return new Map()
  const out = await tavily<{ results?: { url: string; raw_content?: string }[] }>(apiKey, 'extract', { urls, query, chunks_per_source: 3 })
  return new Map((out.results ?? []).filter((r) => r.raw_content?.trim()).map((r) => [r.url, r.raw_content!.slice(0, 4000)]))
}
