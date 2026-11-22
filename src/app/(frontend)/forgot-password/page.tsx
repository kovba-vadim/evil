import { AccountForm } from '@/components/public/account-form'
import { getPageMetadata } from '@/queries/public-seo'
export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  return { ...(await getPageMetadata('forgot-password-page')), robots: { index: false } }
}
export default function ForgotPage() {
  return (
    <section className="account">
      <h1>Восстановление пароля</h1>
      <AccountForm mode="forgot" />
    </section>
  )
}
