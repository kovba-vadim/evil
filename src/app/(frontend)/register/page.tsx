import { AccountForm } from '@/components/public/account-form'
import { getPageMetadata } from '@/queries/public-seo'
export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  return { ...(await getPageMetadata('register-page')), robots: { index: false } }
}
export default function RegisterPage() {
  return (
    <section className="account">
      <h1>Регистрация</h1>
      <AccountForm mode="register" />
    </section>
  )
}
