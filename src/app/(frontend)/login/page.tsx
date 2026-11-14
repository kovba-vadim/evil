import { AccountForm } from '@/components/public/account-form'
import { getPageMetadata } from '@/queries/public-seo'
import { safeReturnTo } from '@/lib/player-policy'
export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  return { ...(await getPageMetadata('login-page')), robots: { index: false } }
}
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  return (
    <section className="account">
      <h1>Вход</h1>
      <AccountForm mode="login" returnTo={safeReturnTo((await searchParams).returnTo)} />
    </section>
  )
}
