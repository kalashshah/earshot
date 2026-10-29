import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Landing } from './landing'

const title = 'Earshot — a private memory of everything you say out loud'
const description =
  'Earshot runs on your Apple Watch, remembers the conversations you have, drafts the follow-ups you promised and writes you a morning brief. Built on NVIDIA Nemotron.'

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  openGraph: { title, description, type: 'website', siteName: 'Earshot' },
  twitter: { card: 'summary', title, description },
}

export default async function Home() {
  const { session } = await getSession()
  if (session) redirect('/today')
  return <Landing />
}
