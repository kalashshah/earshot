'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, ErrBox, Head, icons, Loading } from '@/components/ui'
import { fmtWhen } from '@/lib/format'

type Answer = { answer?: string; sources?: { id: string; started_at: number; title?: string }[] }
const SUGGEST = ['What did Priya say about the launch?', 'What do I owe people this week?', 'Who mentioned pricing?']

export default function AskPage() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  const [res, setRes] = useState<Answer | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function ask(question: string) {
    setAsked(question); setRes(null); setError(null); setBusy(true)
    try { setRes(await api<Answer>('/ask', { body: { question } })) } catch (e) { setError(e) }
    setBusy(false)
  }

  const srcs = res?.sources || []
  return (
    <>
      <Head title="Ask" sub="Ask anything you heard. Answers cite the conversation they came from." />
      <form className="askbox" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q.trim()) }}>
        <label htmlFor="q" className="sr-only">Question</label>
        <input id="q" type="text" placeholder="What did Priya say about the launch?" autoComplete="off" required autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" type="submit" disabled={busy}>Ask</button>
      </form>
      <div className="suggest" aria-label="Example questions">
        {SUGGEST.map((s) => <button key={s} type="button" className="chip" onClick={() => { setQ(s); ask(s) }}>{s}</button>)}
      </div>
      <div aria-live="polite">
        {error ? <ErrBox error={error} /> : asked && (
          <div className="card answer">
            <div className="q">{asked}</div>
            {!res ? <Loading n={3} /> : (
              <>
                <div className="a">{res.answer || 'No answer.'}</div>
                {srcs.length ? (
                  <div className="chips">
                    {srcs.map((s) => (
                      <button key={s.id} className="chip" title="Open in Timeline" onClick={() => router.push(`/timeline?open=${encodeURIComponent(s.id)}`)}>
                        {icons.timelineSm}{s.title || 'Conversation'} <span className="org">· {fmtWhen(s.started_at)}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="faint" style={{ margin: '12px 0 0', fontSize: 12.5 }}>No specific conversation cited.</p>}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
