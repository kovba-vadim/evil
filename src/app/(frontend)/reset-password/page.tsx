import { AccountForm } from '@/components/public/account-form'
import { getPageMetadata } from '@/queries/public-seo'
export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  return {
    ...(await getPageMetadata('reset-password-page')),
    robots: { index: false, follow: false },
    referrer: 'no-referrer' as const,
  }
}
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return (
    <section className="account">
      <h1>Новый пароль</h1>
      {token ? (
        <AccountForm mode="reset" token={token} />
      ) : (
        <p>Ссылка недействительна. Запросите восстановление ещё раз.</p>
      )}
    </section>
  )
}
