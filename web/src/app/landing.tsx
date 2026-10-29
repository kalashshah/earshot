import Link from 'next/link'
import { Particles } from '@/components/particles'
import './landing.css'


// Bar heights (%) for the hero waveform; animation delays are derived from the index.
const WAVE = [30, 52, 40, 68, 46, 82, 58, 92, 64, 76, 48, 88, 60, 100, 70, 84, 54, 72, 44, 90, 62, 78, 50, 66, 38, 56, 34, 46]

const ROLES = [
  ['Founder', 'What did I promise investors this week?', 'Every promise, each with a follow-up already drafted'],
  ['Sales lead', 'What did the customer say about pricing?', 'The exact conversation, cited with the time it happened'],
  ['Consultant', 'What changed since the kickoff?', 'A timeline of decisions, latest version first'],
  ['Manager', 'Who’s waiting on me?', 'A ledger of what you owe and what’s owed to you'],
  ['Busy parent', 'When is Ava’s party and what did we say we’d bring?', 'The answer, straight from your watch'],
]

const PRIVACY = [
  ['Audio is deleted once transcribed', 'Earshot keeps the words, never the recording.'],
  ['Transcripts expire on your schedule', 'Choose how long they’re kept; after that they’re erased.'],
  ['Forget anything, completely', 'Delete a conversation and every memory it produced goes with it.'],
  ['Export everything as one file', 'Your transcripts, memories, promises and briefs, downloadable any time.'],
  ['Your own memory workspace', 'Each account gets an isolated store. Nothing is shared or pooled.'],
  ['Recording is always visible', 'The watch shows when it’s listening. One tap stops it.'],
]

// Copies of icons from components/ui (a client module, so its JSX can't be imported into this server component).
const icons = {
  // eslint-disable-next-line @next/next/no-img-element -- 26px brand mark, next/image adds nothing
  logo: <img src="/logo.png" width={26} height={26} alt="" style={{ borderRadius: 7, display: 'block' }} />,
  promises: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M5.5 8.2l1.8 1.8 3.3-3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  timelineSm: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 8v0M6.5 5v6M9 3v10M11.5 6v4M14 7.5v1" strokeLinecap="round" /></svg>,
}

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" /><path d="M5.3 8.2l1.8 1.8 3.6-3.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Tags = ({ items }: { items: string[] }) => <ul className="lp-tags">{items.map((t) => <li key={t}>{t}</li>)}</ul>

export function Landing() {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <header className="lp-header">
        <div className="lp-wrap lp-header-in">
          <Link href="/" className="lp-brand" aria-label="Earshot home">{icons.logo}<span>Earshot</span></Link>
          <nav aria-label="Sections" className="lp-nav">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="lp-header-cta">
            <Link className="btn line" href="/sign-in">Sign in</Link>
            <Link className="btn primary" href="/sign-in">Get started</Link>
          </div>
        </div>
      </header>

      <main id="main" className="lp-main">
        {/* Hero */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <p className="lp-kicker"><span className="lp-rec" aria-hidden="true" />On your Apple Watch · NVIDIA Nemotron</p>
              <h1 id="hero-title" className="lp-display">Remember every conversation. <em>Keep every promise.</em></h1>
              <p className="lp-lede">
                Earshot runs on your Apple Watch and hears the conversations you have. It turns them into memory you can ask about,
                follow-ups it drafts for you, and a brief waiting each morning.
              </p>
              <div className="lp-ctas">
                <Link className="btn primary lg" href="/sign-in">Get started</Link>
                <a className="btn line lg" href="#how">See how it works</a>
              </div>
            </div>

            <figure className="lp-heromock" aria-label="Earshot listening on the watch, and a promise it caught">
              <Particles className="lp-particles hero" />
              <div className="lp-card lp-capture">
                <div className="lp-capture-top">
                  <span className="lp-mock-title">Earshot</span>
                  <span className="lp-capture-status"><span className="tnum">12:48</span><span className="lp-live"><i />Live</span></span>
                </div>
                <div className="lp-wavebox">
                  <div className="lp-wave" aria-hidden="true">
                    {WAVE.map((h, i) => <span key={i} style={{ height: `${h}%`, animationDelay: `${-((i * 137) % 1100)}ms` }} />)}
                  </div>
                  <p>Listening…</p>
                </div>
                <div className="lp-capture-foot"><span>3 moments kept today</span><span>Audio deleted after transcription</span></div>
              </div>
              <div className="lp-card lp-float">
                <span className="lp-float-k">Promise caught · 11:20</span>
                <b>Send Priya the pilot contract</b>
                <span className="lp-float-meta"><span className="badge due">Friday</span><span className="lp-ready">{icons.promises} Draft ready</span></span>
              </div>
            </figure>
          </div>
        </section>

        {/* Stats */}
        <section className="lp-wrap lp-stats" aria-label="By the numbers">
          <dl>
            <div><dt>correct answers on a 40-question day eval</dt><dd>73%</dd></div>
            <div><dt>per question asked</dt><dd>$0.0008</dd></div>
            <div><dt>of audio kept. It’s deleted the moment it’s transcribed</dt><dd>0 s</dd></div>
          </dl>
        </section>

        {/* How it works */}
        <section id="how" className="lp-wrap lp-section" aria-labelledby="how-title">
          <p className="lp-kicker">01 / How it works</p>
          <h2 id="how-title" className="lp-h2">One day with Earshot</h2>
          <ol className="lp-day">
            <li>
              <time className="lp-time">09:00</time>
              <h3>Wear it</h3>
              <p>Tap record on your watch. Earshot keeps only the moments when people are talking and skips the silence.</p>
            </li>
            <li>
              <time className="lp-time">11:20</time>
              <h3>It remembers</h3>
              <p>Nemotron pulls out who said what, the decisions made and the promises given. The audio is deleted once it’s transcribed.</p>
            </li>
            <li>
              <time className="lp-time">07:00 <span>next day</span></time>
              <h3>Wake up ahead</h3>
              <p>A brief: what mattered, what you owe, and news about the companies you talked about, with sources.</p>
            </li>
          </ol>
        </section>

        {/* Asking table */}
        <section className="lp-band" aria-labelledby="ask-title">
          <div className="lp-wrap">
            <p className="lp-kicker">02 / Ask</p>
            <h2 id="ask-title" className="lp-h2">Ask it like you’d ask <em>a colleague who was there</em></h2>
            <div className="lp-card lp-tablecard">
              <table className="lp-table">
                <thead>
                  <tr><th scope="col"><span className="sr-only">Role</span></th><th scope="col">When you’re asking</th><th scope="col"><span className="sr-only">leads to</span></th><th scope="col">Earshot gives you</th></tr>
                </thead>
                <tbody>
                  {ROLES.map(([role, q, a]) => (
                    <tr key={role}>
                      <th scope="row">{role}</th>
                      <td className="q">“{q}”</td>
                      <td className="arrow" aria-hidden="true">→</td>
                      <td className="a">{a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="lp-wrap lp-section" aria-labelledby="features-title">
          <p className="lp-kicker">03 / Features</p>
          <h2 id="features-title" className="sr-only">Features</h2>

          <article className="lp-feature">
            <div className="lp-feature-copy">
              <p className="lp-eyebrow">Promises</p>
              <h3 className="lp-h3">The follow-up is written <em>before you remember it.</em></h3>
              <p>When you say “I’ll send that over”, Earshot notes who it’s for and when it’s due, then drafts the message in your voice. Edit it, send it, or mark it done.</p>
              <Tags items={['Drafted by Nemotron Super', 'One tap to send']} />
            </div>
            <figure className="lp-mock" aria-label="A promise with a drafted follow-up">
              <p className="lp-mock-group">You owe <span>2</span></p>
              <div className="card list">
                <div className="row">
                  <div className="row-title">Send the pilot contract</div>
                  <div className="muted" style={{ fontSize: 13 }}>To Priya Raman</div>
                  <div className="row-meta"><span className="badge due">Due Friday</span><span>From “Pilot scope with Priya”</span><span>Today, 11:20 AM</span></div>
                  <div className="draft-label">Follow-up drafted by Nemotron · edit before sending</div>
                  <div className="lp-draft">Hi Priya, great talking today. Attached is the pilot contract with the 60-day term we discussed. Happy to walk legal through it Thursday if that helps.</div>
                  <div className="row-actions">
                    <span className="btn primary sm">Send</span><span className="btn sm">Copy</span><span className="btn sm">Mark done</span>
                  </div>
                </div>
              </div>
            </figure>
          </article>

          <article className="lp-feature flip">
            <div className="lp-feature-copy">
              <p className="lp-eyebrow">Ask from your wrist</p>
              <h3 className="lp-h3">Ask what was said. <em>Get what’s true now.</em></h3>
              <p>Ask from your watch or the web. Answers cite the conversation they came from, and when a plan changed during the day, the latest version wins.</p>
              <Tags items={['Cites the conversation', 'Latest version wins']} />
            </div>
            <figure className="lp-mock" aria-label="A question and its cited answer">
              <div className="lp-bubble">When is the Shopify launch now?</div>
              <div className="card answer">
                <div className="q">Answer</div>
                <div className="a">October 27. The November 10 plan was reversed in the afternoon.</div>
                <div className="chips">
                  <span className="chip lp-src">{icons.timelineSm}Launch sync <span className="org">· Today, 3:42 PM</span></span>
                  <span className="chip lp-src">{icons.timelineSm}Standup <span className="org">· Today, 9:15 AM</span></span>
                </div>
              </div>
            </figure>
          </article>

          <article className="lp-feature">
            <div className="lp-feature-copy">
              <p className="lp-eyebrow">Morning brief</p>
              <h3 className="lp-h3">Start the day <em>already caught up.</em></h3>
              <p>Every morning Earshot reads yesterday back to you: the decisions, the promises still open, and fresh news on the people and companies that came up, each line linked to its source.</p>
              <Tags items={['Nemotron Ultra', 'Tavily research']} />
            </div>
            <figure className="lp-mock" aria-label="A morning brief with citations">
              <article className="card brief lp-brief">
                <div className="brief-meta"><span>For Thursday, October 16</span><span>Written 7:00 AM</span></div>
                <h3>Yesterday</h3>
                <ul><li>Shopify launch moved back to <strong>October 27</strong> after the afternoon sync.</li><li>Priya agreed to a 60-day pilot.</li></ul>
                <h3>Promises</h3>
                <ul><li>You owe Priya the pilot contract by Friday.</li><li>Marcus will send the revised pricing deck.</li></ul>
                <h3>People &amp; news</h3>
                <ul><li>Northwind closed a Series B on Tuesday<sup className="cite"><a>1</a></sup>, the week before your renewal call.</li></ul>
                <div className="sources"><span className="faint">Sources · Tavily</span><ol><li>Northwind raises Series B <span className="faint">· news.example.com</span></li></ol></div>
              </article>
            </figure>
          </article>

          <article id="privacy" className="lp-feature lp-privacy">
            <div className="lp-feature-copy">
              <p className="lp-eyebrow">Privacy</p>
              <h3 className="lp-h3">Private <em>by construction.</em></h3>
              <p>Earshot is a memory for you, not a recording of everyone else. Record only with people who know you’re using it.</p>
            </div>
            <ul className="lp-privacy-list">
              {PRIVACY.map(([t, d]) => <li key={t}><Check /><div><b>{t}</b><span>{d}</span></div></li>)}
            </ul>
          </article>
        </section>

        {/* Built on */}
        <section className="lp-builton" aria-label="Built on">
          <div className="lp-wrap lp-builton-in">
            <span className="lp-eyebrow">Built on</span>
            <ul>
              <li><b className="nv">NVIDIA Nemotron</b> <span>Lightning · Super · Ultra</span></li>
              <li><b>Nebius Token Factory</b></li>
              <li><b>Tavily</b></li>
              <li><b>Cloudflare</b></li>
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="lp-final" aria-labelledby="final-title">
          <Particles className="lp-particles final" shape="disc" pitch={0.42} size={2} />
          <div className="lp-wrap lp-final-in">
            <h2 id="final-title" className="lp-display sm">Your day, <em>remembered.</em></h2>
            <p className="lp-lede">Pair your watch in a couple of minutes. Tomorrow morning, your first brief.</p>
            <div className="lp-ctas"><Link className="btn primary lg" href="/sign-in">Get started</Link></div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span>© 2026 Earshot</span>
          <nav aria-label="Footer"><a href="#privacy">Privacy</a><Link href="/sign-in">Sign in</Link></nav>
        </div>
      </footer>
    </div>
  )
}
