import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { googleEnabled } from '@/lib/auth'
import { SignInForm } from './sign-in-form'

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { env, session } = await getSession()
  // only same-site paths, so ?next= can't bounce someone to another site
  const { next: raw } = await searchParams
  const next = raw?.startsWith('/') && !raw.startsWith('//') ? raw : '/today'
  if (session) redirect(next)
  return <SignInForm google={googleEnabled(env)} next={next} />
}
