import { NextResponse } from 'next/server'
import { playerSession, logoutPlayer, savePlayerCookie } from '@/auth/players'
import { consumeAttempt, isDevelopment, passwordError, safeReturnTo } from '@/lib/player-policy'
import { isTimeZoneID } from '@/lib/time-zones'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
const reply = (message: string, status = 200, extra = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers })

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  // Browser writes require an exact origin; forwarded host/IP headers are not trusted.
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return reply('Недопустимый источник запроса.', 403)
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return reply('Ожидается JSON.', 415)
  if (!consumeAttempt('portal:global', 300))
    return reply('Слишком много запросов. Повторите через 15 минут.', 429)
  const { action } = await params
  if (!['login', 'register', 'logout', 'profile', 'password', 'forgot', 'reset'].includes(action))
    return reply('Не найдено.', 404)
  let body: Record<string, unknown>
  try {
    const reader = request.body?.getReader()
    if (!reader) return reply('Некорректный запрос.', 400)
    const decoder = new TextDecoder()
    let raw = '',
      size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4096) {
        await reader.cancel()
        return reply('Слишком большой запрос.', 413)
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    body = JSON.parse(raw)
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error()
  } catch {
    return reply('Некорректный запрос.', 400)
  }
  const string = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : '')
  const email = string('email').trim().toLowerCase()
  if (
    ['register', 'login', 'forgot', 'reset'].includes(action) &&
    !consumeAttempt(
      `${action}:${email || 'anonymous'}`,
      action === 'register' || action === 'forgot' ? 3 : 10,
    )
  )
    return reply('Слишком много попыток. Повторите через 15 минут.', 429)
  if (['register', 'forgot'].includes(action) && !isDevelopment())
    return reply('Доставка почты не настроена. Операция временно недоступна.', 503)
  if (
    ['login', 'register', 'forgot'].includes(action) &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  )
    return reply('Введите корректный email.', 400)
  if (['register', 'password', 'reset'].includes(action)) {
    const error = passwordError(body.password)
    if (error) return reply(error, 400)
    if (body.password !== body.confirmPassword) return reply('Пароли не совпадают.', 400)
  }
  if (action === 'login' && (!string('password') || string('password').length > 128))
    return reply('Введите email и пароль.', 400)
  try {
    const { payload, user } = await playerSession()
    if (
      user &&
      ['profile', 'password', 'logout'].includes(action) &&
      !consumeAttempt(`${action}:player:${user.id}`, action === 'password' ? 10 : 30)
    )
      return reply('Слишком много попыток. Повторите через 15 минут.', 429)
    if (action === 'logout') {
      await logoutPlayer()
      return reply('Вы вышли.', 200, { redirect: '/login' })
    }
    if (action === 'register') {
      const nickname = string('nickname').trim()
      if (nickname.length < 2 || nickname.length > 40)
        return reply('Введите ник от 2 до 40 символов.', 400)
      // Trusted registration: only whitelisted fields; public create access remains closed.
      try {
        await payload.create({
          collection: 'players',
          overrideAccess: true,
          disableVerificationEmail: true,
          data: {
            email,
            nickname,
            password: string('password'),
            timeZone: 'server',
            _verified: false,
          },
        })
      } catch {
        return reply(
          'Не удалось зарегистрироваться. Проверьте данные или попробуйте восстановить пароль.',
          400,
        )
      }
      return reply('Аккаунт создан. Войдите с email и паролем.', 200, { redirect: '/login' })
    }
    if (action === 'login') {
      const result = await payload.login({
        collection: 'players',
        data: { email, password: string('password') },
        overrideAccess: false,
        context: { playerPortal: true },
      })
      if (!result.token) throw new Error()
      await savePlayerCookie(result.token)
      return reply('Вход выполнен.', 200, { redirect: safeReturnTo(body.returnTo) })
    }
    if (action === 'forgot') {
      // Payload creates an expiring token; never return it to the client.
      const token = await payload.forgotPassword({
        collection: 'players',
        data: { email },
        disableEmail: true,
        overrideAccess: true,
      })
      if (isDevelopment() && token) {
        const url = new URL('/reset-password', request.url)
        url.searchParams.set('token', token)
        console.info('[development] Восстановление пароля:', url.href)
      }
      return reply(
        'Если аккаунт существует, инструкция восстановления будет отправлена. В локальной разработке проверьте серверный терминал.',
      )
    }
    if (action === 'reset') {
      const token = string('token')
      if (!token || token.length > 256) return reply('Ссылка недействительна или устарела.', 400)
      await payload.resetPassword({
        collection: 'players',
        data: { token, password: string('password') },
        overrideAccess: true,
      })
      // Reset invalidates old sessions. Do not automatically log in an unverified account.
      return reply('Пароль изменён. Войдите с новым паролем.', 200, { redirect: '/login' })
    }
    if (!user) return reply('Необходимо войти.', 401)
    if (action === 'profile') {
      const nickname = string('nickname').trim()
      if (nickname.length < 2 || nickname.length > 40 || !isTimeZoneID(body.timeZone))
        return reply('Проверьте ник и часовой пояс.', 400)
      await payload.update({
        collection: 'players',
        id: user.id,
        user,
        overrideAccess: false,
        data: { nickname, timeZone: body.timeZone },
      })
      return reply('Профиль сохранён.')
    }
    if (action === 'password') {
      if (!string('currentPassword') || string('currentPassword').length > 128)
        return reply('Введите текущий пароль.', 400)
      // Payload verifies the current password and applies its persistent account lockout.
      await payload.login({
        collection: 'players',
        data: { email: user.email, password: string('currentPassword') },
        overrideAccess: false,
        context: { playerPortal: true },
      })
      await payload.update({
        collection: 'players',
        id: user.id,
        user,
        overrideAccess: false,
        context: { playerPasswordChange: true },
        data: { password: string('password') },
      })
      // Revoke every session after a password change, including the verification login above.
      const { createLocalReq, logoutOperation } = await import('payload')
      await logoutOperation({
        collection: payload.collections.players,
        allSessions: true,
        req: await createLocalReq({ user }, payload),
      })
      await logoutPlayer()
      return reply('Пароль изменён. Войдите снова.', 200, { redirect: '/login' })
    }
    return reply('Не найдено.', 404)
  } catch {
    return reply(
      action === 'reset'
        ? 'Ссылка недействительна или устарела.'
        : action === 'login' || action === 'password'
          ? 'Не удалось войти. Проверьте пароль и подтверждение email; после нескольких ошибок подождите 15 минут.'
          : 'Операция не выполнена. Попробуйте позже.',
      400,
    )
  }
}
