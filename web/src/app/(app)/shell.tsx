'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from '@/lib/auth-client'
import { api, icons, Powered } from '@/components/ui'
import { Particles } from '@/components/particles'

const TABS = [
  ['today', 'Today'], ['promises', 'Promises'], ['ask', 'Ask'], ['timeline', 'Timeline'],
  ['memory', 'Memory'], ['privacy', 'Privacy & cost'], ['settings', 'Settings'],
] as const

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [owed, setOwed] = useState(0)

  useEffect(() => {
    const load = () => api<{ actions?: { owner: string }[] }>('/actions?status=open')
      .then(({ actions = [] }) => setOwed(actions.filter((a) => a.owner === 'you').length))
      .catch(() => {})
    load()
    window.addEventListener('earshot:counts', load)
    return () => window.removeEventListener('earshot:counts', load)
  }, [])

  // On phones the tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    document.querySelector('.mobilebar [aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  const nav = (
    <nav aria-label="Sections">
      {TABS.map(([k, label]) => (
        <Link key={k} href={`/${k}`} className="tab" aria-current={pathname === `/${k}` ? 'page' : undefined}>
          {icons[k]}<span>{label}</span>
          <span className="count">{k === 'promises' && owed ? owed : ''}</span>
        </Link>
      ))}
    </nav>
  )
  const out = () => signOut().finally(() => { window.location.href = '/sign-in' })

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">{icons.logo}<span>Earshot</span></div>
        {nav}
        <Particles className="side-particles" size={1.8} pitch={0.3} />
        <div className="side-foot"><Powered /><br /><button className="signout" onClick={out}>Sign out</button></div>
      </aside>
      <div className="min-w-0">
        <header className="mobilebar">
          <div className="brand">{icons.logo}<span>Earshot</span></div>
          {nav}
        </header>
        <main>{children}</main>
        <footer className="foot-mobile"><Powered /><br /><button className="signout" onClick={out}>Sign out</button></footer>
      </div>
    </div>
  )
}
