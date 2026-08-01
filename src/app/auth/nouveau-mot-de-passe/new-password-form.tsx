'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Btn } from '@/components/nk/btn'
import { AuthField } from '@/components/auth/auth-field'
import { OtpInput } from '@/components/auth/otp-input'
import { FormError } from '@/components/form-error'
import { ApiError, apiPost } from '@/lib/http'

const PASSWORD_MIN_LENGTH = 10

export function NewPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})

    if (password !== passwordConfirm) {
      setFieldErrors({ passwordConfirm: 'Les deux mots de passe ne correspondent pas' })
      return
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setFieldErrors({ password: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères` })
      return
    }

    setPending(true)
    try {
      await apiPost('/api/auth/reset-password', { email, code, password })
      toast.success('Mot de passe réinitialisé. Connectez-vous.')
      router.replace(`/auth/connexion?email=${encodeURIComponent(email)}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
        setFieldErrors(err.fieldErrors())
      } else {
        setFormError('Une erreur est survenue. Réessayez.')
      }
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {formError && <FormError message={formError} />}

      <AuthField
        label="Adresse e-mail"
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        disabled={pending}
        className={formError ? 'mt-4' : undefined}
      />

      <OtpInput value={code} onChange={setCode} disabled={pending} label="Code reçu par email" />

      <AuthField
        label="Nouveau mot de passe"
        type="password"
        name="password"
        autoComplete="new-password"
        placeholder="••••••••"
        required
        value={password}
        onChange={e => setPassword(e.target.value)}
        disabled={pending}
        hint={`${PASSWORD_MIN_LENGTH} caractères minimum.`}
        error={fieldErrors.password}
      />

      <AuthField
        label="Confirmer le mot de passe"
        type="password"
        name="passwordConfirm"
        autoComplete="new-password"
        placeholder="••••••••"
        required
        value={passwordConfirm}
        onChange={e => setPasswordConfirm(e.target.value)}
        disabled={pending}
        error={fieldErrors.passwordConfirm}
      />

      <Btn type="submit" size="lg" className="w-full" disabled={pending || code.length !== 6}>
        {pending ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
      </Btn>
    </form>
  )
}
