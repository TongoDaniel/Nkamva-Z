'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Btn } from '@/components/nk/btn'
import { AuthField } from '@/components/auth/auth-field'
import { OtpInput } from '@/components/auth/otp-input'
import { FormError } from '@/components/form-error'
import { ApiError, apiPost } from '@/lib/http'

export function VerifyCodeForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [code, setCode] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setPending(true)

    try {
      await apiPost('/api/auth/verify-otp', { email, code })
      router.replace(`/auth/connexion?verifie=1&email=${encodeURIComponent(email)}`)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessayez.')
      setPending(false)
    }
  }

  async function handleResend() {
    setFormError(null)
    setPending(true)
    try {
      await apiPost('/api/auth/otp', { email })
      toast.success('Nouveau code envoyé')
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessayez.')
    } finally {
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

      <OtpInput value={code} onChange={setCode} disabled={pending} />

      <Btn type="submit" size="lg" className="w-full" disabled={pending || code.length !== 6}>
        {pending ? 'Vérification…' : 'Vérifier mon adresse'}
      </Btn>

      <Btn type="button" variant="tint" className="mt-2 w-full" onClick={handleResend} disabled={pending || !email}>
        Renvoyer le code
      </Btn>
    </form>
  )
}
