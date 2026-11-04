import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Landing } from './landing'

const title = 'Earshot: a private memory of everything you say out loud'
const description =
  'Earshot runs on your Apple Watch, remembers the conversations you have, drafts the follow-ups you promised and writes you a morning brief. Built on NVIDIA Nemotron.'

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/' },
  openGraph: { title, description, type: 'website', siteName: 'Earshot', url: '/', images: ['/icon.png'] },
  twitter: { card: 'summary', title, description, images: ['/icon.png'] },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'MobileApplication',
      name: 'Earshot',
      url: 'https://earshot.keronlabs.com',
      description,
      operatingSystem: 'iOS, watchOS',
      applicationCategory: 'ProductivityApplication',
      publisher: { '@id': 'https://earshot.keronlabs.com/#org' },
    },
    {
      '@type': 'Organization',
      '@id': 'https://earshot.keronlabs.com/#org',
      name: 'Earshot',
      url: 'https://earshot.keronlabs.com',
      logo: 'https://earshot.keronlabs.com/icon.png',
      parentOrganization: { '@type': 'Organization', name: 'Keron Labs', url: 'https://keronlabs.com' },
    },
  ],
}

export default async function Home() {
  const { session } = await getSession()
  if (session) redirect('/today')
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Landing />
    </>
  )
}
