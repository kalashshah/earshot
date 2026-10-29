// Formatting + the brief's markdown renderer, ported from server/public/index.html.

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export const parseJSON = <T,>(s: unknown, d: T): T => {
  if (s && typeof s === 'object') return s as T
  try { return (JSON.parse(String(s)) as T) ?? d } catch { return d }
}
export const safeUrl = (u?: string) => (/^https?:\/\//i.test(u || '') ? u! : '#')
export const fmtTime = (ms: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ms)
export const fmtDay = (ms: number) => {
  const d = new Date(ms), t = new Date()
  t.setHours(0, 0, 0, 0)
  const diff = Math.round((t.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 864e5)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' }).format(d)
}
export const fmtWhen = (ms: number) => `${fmtDay(ms)}, ${fmtTime(ms)}`
// "2026-10-14" is a calendar day, not an instant: render it at local noon so no timezone shifts it.
export const isoDay = (s: string) => new Date(`${s}T12:00:00`).getTime()
export const fmtIsoDay = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat(undefined, opts).format(isoDay(s))
export const fmtDur = (ms: number) => {
  const m = Math.round((ms || 0) / 60000)
  return m < 1 ? '<1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`
}
export const fmtUsd = (x: unknown) => {
  const n = Number(x) || 0
  return '$' + (n === 0 ? '0.00' : n < 0.01 ? n.toFixed(4) : n < 1 ? n.toFixed(3) : n.toFixed(2))
}
export const fmtNum = (n: number) => new Intl.NumberFormat(undefined, { notation: n >= 1e5 ? 'compact' : 'standard' }).format(n || 0)
export const initials = (name: string) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

export type Source = { n: number | string; title: string; url: string; org?: string }

function inlineMd(s: string, sources: Source[]) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/\[(\d+)\](?!\()/g, (_m, n) => {
      const src = sources.find((x) => String(x.n) === n)
      return src
        ? `<sup class="cite"><a href="${esc(safeUrl(src.url))}" target="_blank" rel="noopener" title="${esc(src.title)}">${n}</a></sup>`
        : `<sup class="cite"><a>${n}</a></sup>`
    })
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

/** Markdown subset → HTML. Every input character is escaped before any tag is added. */
export function renderMd(md: string, sources: Source[] = []) {
  const out: string[] = []
  let list = false
  const close = () => { if (list) { out.push('</ul>'); list = false } }
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trimEnd()
    let m
    if ((m = line.match(/^#{1,2}\s+(.*)/))) { close(); out.push(`<h3>${inlineMd(m[1], sources)}</h3>`) }
    else if ((m = line.match(/^#{3,6}\s+(.*)/))) { close(); out.push(`<h4>${inlineMd(m[1], sources)}</h4>`) }
    else if ((m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/))) { if (!list) { out.push('<ul>'); list = true } out.push(`<li>${inlineMd(m[1], sources)}</li>`) }
    else if (!line.trim()) close()
    else { close(); out.push(`<p>${inlineMd(line, sources)}</p>`) }
  }
  close()
  return out.join('')
}

/** Splits "[2026-10-15 10:05 · clip <uuid>] text (source: https://…)" into its parts. */
export function parseMemory(raw: string) {
  let content = String(raw || ''), tag = '', news = false, link = '', clip = ''
  const pm = content.match(/^\[([^\]]+)\]\s*/)
  if (pm) {
    tag = pm[1]; content = content.slice(pm[0].length)
    if (/^news\b/i.test(tag)) { news = true; tag = tag.replace(/^news\s*/i, '') }
    const cm = tag.match(/\s*·\s*clip\s+([0-9a-f-]{36})/i)
    if (cm) { clip = cm[1]; tag = tag.replace(cm[0], '') }
  }
  const sm = content.match(/\s*\(source:\s*(https?:\/\/[^\s)]+)\)\s*$/i)
  if (sm) { link = sm[1]; content = content.slice(0, sm.index) }
  let host = ''
  try { host = link ? new URL(link).hostname.replace(/^www\./, '') : '' } catch {}
  return { content, tag, news, link, clip, host }
}

const MODEL_LABELS: [RegExp, string, string][] = [
  [/lightning/i, 'Nemotron 3.5 Lightning', '#76b900'], [/super/i, 'Nemotron 3 Super', '#4a8f2a'],
  [/ultra/i, 'Nemotron 3 Ultra', '#2b5c1a'], [/nova|deepgram/i, 'Deepgram Nova-3', '#ff8a50'],
]
export const modelInfo = (m: string) => {
  const hit = MODEL_LABELS.find(([re]) => re.test(m))
  return hit ? { label: hit[1], color: hit[2] } : { label: m, color: '#9a9994' }
}
