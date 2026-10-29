import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google'
import './globals.css'

// The two brand faces, shared by the landing page and the app (see --font-display / --mono).
const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--display', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--jbmono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Earshot',
  description: 'A private memory of everything you say out loud.',
}

export const viewport: Viewport = { colorScheme: 'light dark' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
