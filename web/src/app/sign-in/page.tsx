import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { googleEnabled } from '@/lib/auth'
import { SignInForm } from './sign-in-form'
import type { Metadata } from 'next'

const title = 'Sign in to Earshot'
const description = 'Sign in to Earshot to see your morning brief, promises, memory and conversation timeline.'

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/sign-in' },
  openGraph: { title, description, type: 'website', siteName: 'Earshot', url: '/sign-in', images: ['/icon.png'] },
  twitter: { card: 'summary', title, description, images: ['/icon.png'] },
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { env, session } = await getSession()
  // only same-site paths, so ?next= can't bounce someone to another site
  const { next: raw } = await searchParams
  const next = raw?.startsWith('/') && !raw.startsWith('//') ? raw : '/today'
  if (session) redirect(next)
  return <SignInForm google={googleEnabled(env)} next={next} />
}
