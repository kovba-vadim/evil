'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { TIME_ZONES, normalizeTimeZone } from '@/lib/time-zones'
import { setTimeZone } from './time-zone'

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'profile' | 'password'
export function AccountForm({
  mode,
  email,
  nickname,
  timeZone,
  token = '',
  returnTo = '/account',
}: {
  mode: Mode
  email?: string
  nickname?: string
  timeZone?: string
  token?: string
  returnTo?: string
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [currentZone, setCurrentZone] = useState(normalizeTimeZone(timeZone))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      const response = await fetch(`/api/account/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, token, returnTo }),
      })
      const result = await response.json()
      setMessage(result.message)
      setFailed(!response.ok)
      if (response.ok && mode === 'profile') setTimeZone(normalizeTimeZone(data.timeZone))
      if (response.ok && result.redirect) window.location.assign(result.redirect)
    } catch {
      setFailed(true)
      setMessage('Нет связи с сервером. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }
  const password = (label: string, name: string, autoComplete: string, minLength?: number) => (
    <label className="account-form__field">
      <span>{label}</span>
      <input
        name={name}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={128}
      />
    </label>
  )
  return (
    <form className="account-form" onSubmit={submit}>
      {['login', 'register', 'forgot'].includes(mode) && (
        <label className="account-form__field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
      )}
      {mode === 'profile' && <p>Email: {email}</p>}
      {['register', 'profile'].includes(mode) && (
        <label className="account-form__field">
          <span>Ник</span>
          <input
            name="nickname"
            autoComplete="nickname"
            defaultValue={nickname}
            required
            minLength={2}
            maxLength={40}
          />
        </label>
      )}
      {mode === 'profile' && (
        <label className="account-form__field">
          <span>Часовой пояс</span>
          <select
            aria-label="Часовой пояс"
            name="timeZone"
            value={currentZone}
            onChange={(event) => setCurrentZone(normalizeTimeZone(event.target.value))}
          >
            {TIME_ZONES.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.city}
                {zone.id === 'server' ? ' — UTC+3' : ` — ${zone.id}`}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === 'password' && password('Текущий пароль', 'currentPassword', 'current-password')}
      {mode !== 'forgot' &&
        mode !== 'profile' &&
        password(
          mode === 'login' ? 'Пароль' : 'Новый пароль (12–128 символов)',
          'password',
          mode === 'login' ? 'current-password' : 'new-password',
          mode === 'login' ? undefined : 12,
        )}
      {['register', 'password', 'reset'].includes(mode) &&
        password('Подтверждение пароля', 'confirmPassword', 'new-password', 12)}
      <p className="account-form__message" role={failed ? 'alert' : 'status'} aria-live="polite">
        {message}
      </p>
      <button className="account-form__button" disabled={busy} type="submit">
        {busy
          ? 'Подождите…'
          : {
              login: 'Войти',
              register: 'Зарегистрироваться',
              forgot: 'Восстановить пароль',
              reset: 'Сохранить новый пароль',
              profile: 'Сохранить профиль',
              password: 'Изменить пароль',
            }[mode]}
      </button>
      {mode === 'login' && (
        <div className="account-form__links">
          <Link href="/register">Регистрация</Link>
          <Link href="/forgot-password">Забыли пароль?</Link>
        </div>
      )}
      {['register', 'forgot', 'reset'].includes(mode) && <Link href="/login">Войти</Link>}
    </form>
  )
}

export function AccountTimeZone({ timeZone }: { timeZone: string }) {
  useEffect(() => {
    setTimeZone(normalizeTimeZone(timeZone))
  }, [timeZone])
  return null
}
