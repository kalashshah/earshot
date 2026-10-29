'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, Empty, ErrBox, Head, Loading, Spin } from '@/components/ui'
import { fmtWhen, parseMemory, plural } from '@/lib/format'

type Mem = { id: string; content: string; type?: string; createdAt?: string }
const PAGE = 50

export default function MemoryPage() {
  const [all, setAll] = useState<Mem[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [paging, setPaging] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ q: string; list: Mem[] | null } | null>(null)
  const [error, setError] = useState<unknown>(null)

  const fetchPage = (offset: number) => api<{ memories?: Mem[] }>(`/memories?limit=${PAGE}&offset=${offset}`).then((r) => r.memories || [])
  const append = (got: Mem[]) => { setAll((a) => (a || []).concat(got)); setHasMore(got.length === PAGE) }
  useEffect(() => { fetchPage(0).then(append, setError) }, [])
  async function page(offset: number) {
    setPaging(true)
    try { append(await fetchPage(offset)) } catch (e) { setError(e) }
    setPaging(false)
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (!query) return setResults(null)
    setResults({ q: query, list: null }); setError(null)
    try { setResults({ q: query, list: (await api<{ memories?: Mem[] }>('/memories/search', { body: { query } })).memories || [] }) }
    catch (err) { setResults(null); setError(err) }
  }
  const gone = (id: string) => {
    setAll((a) => a && a.filter((x) => x.id !== id))
    setResults((r) => r && { ...r, list: r.list && r.list.filter((x) => x.id !== id) })
  }
  const clear = () => { setQ(''); setResults(null) }

  const list = results ? results.list : all
  return (
    <>
      <Head title="Memory" sub="Facts Nemotron kept from your conversations, plus news about the people and companies in them." />
      <form role="search" onSubmit={search}>
        <label htmlFor="mq" className="sr-only">Search memories</label>
        <input id="mq" type="search" placeholder="Search memories — e.g. “Acme pricing”" autoComplete="off" value={q}
          onChange={(e) => { setQ(e.target.value); if (!e.target.value) setResults(null) }} />
      </form>
      <div style={{ marginTop: 14 }}>
        {error ? <ErrBox error={error} /> : !list ? <Loading n={results ? 4 : 6} /> : !list.length ? (
          results ? <div className="note">Nothing matches “{results.q}”.</div>
            : <Empty title="No memories yet"><p>Each conversation adds a handful of facts here. Every one links back to the conversation it came from, and can be forgotten with it.</p></Empty>
        ) : (
          <>
            {results && (
              <p className="faint" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
                {plural(list.length, 'result')} for “{results.q}” · <button className="signout" style={{ margin: 0 }} onClick={clear}>clear</button>
              </p>
            )}
            <div className="card list">{list.map((m) => <MemRow key={m.id} m={m} onGone={gone} />)}</div>
            {!results && hasMore && (
              <div className="more"><button className="btn" disabled={paging} onClick={() => page(all!.length)}>{paging ? <><Spin /> Loading</> : 'Load more'}</button></div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function MemRow({ m, onGone }: { m: Mem; onGone: (id: string) => void }) {
  const router = useRouter()
  const { content, tag, news, link, clip, host } = parseMemory(m.content)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function forget() {
    setBusy(true); setError(null)
    try { await api(`/memories/${encodeURIComponent(m.id)}`, { method: 'DELETE' }); setLeaving(true); setTimeout(() => onGone(m.id), 250) }
    catch (e) { setError(e); setBusy(false) }
  }

  return (
    <div className={`row mem${leaving ? ' leaving' : ''}`}>
      <div className="tagline">
        {news && <span className="badge news">NEWS</span>}
        {tag && <span>{tag}</span>}
        {clip && <button className="chip" style={{ fontFamily: 'var(--font)', fontSize: 11.5, padding: '0 8px' }} onClick={() => router.push(`/timeline?open=${clip}`)}>conversation</button>}
        {link && <a href={link} target="_blank" rel="noopener" style={{ fontFamily: 'var(--font)' }}>{host} ↗</a>}
        {m.createdAt && !tag && <span>{fmtWhen(new Date(m.createdAt).getTime())}</span>}
        <button className="btn ghost sm danger" style={{ marginLeft: 'auto', fontFamily: 'var(--font)' }} aria-label="Forget this memory" onClick={() => setConfirm(true)}>Forget</button>
      </div>
      <div className="content">{content}</div>
      {confirm && (
        <div className="err" role="alertdialog" aria-label="Confirm forget">
          Forget this memory? Earshot will no longer use it in answers or briefs.
          <div className="row-actions">
            <button className="btn sm danger" autoFocus disabled={busy} onClick={forget}>{busy ? <><Spin /> Forgetting</> : 'Forget it'}</button>
            <button className="btn ghost sm" onClick={() => setConfirm(false)}>Keep</button>
          </div>
          {error instanceof Error && <p style={{ margin: '8px 0 0' }}>{error.message}</p>}
        </div>
      )}
    </div>
  )
}
