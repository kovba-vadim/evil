import { redirect } from 'next/navigation'
import { playerSession } from '@/auth/players'
import { AccountForm } from '@/components/public/account-form'
import { getPageMetadata } from '@/queries/public-seo'

export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  return { ...(await getPageMetadata('account-page')), robots: { index: false, follow: false } }
}
export default async function AccountPage() {
  const { user } = await playerSession()
  if (!user) redirect('/login?returnTo=%2Faccount')
  return (
    <section className="account">
      <h1>Личный кабинет</h1>
      <h2>Профиль</h2>
      <AccountForm
        mode="profile"
        email={user.email}
        nickname={user.nickname}
        timeZone={user.timeZone}
      />
      <h2>Смена пароля</h2>
      <AccountForm mode="password" />
    </section>
  )
}
