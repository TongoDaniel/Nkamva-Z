'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Btn } from '@/components/nk/btn'
import { AuthField } from '@/components/auth/auth-field'
import { FormError } from '@/components/form-error'
import { ApiError, apiPost } from '@/lib/http'

export function ForgotPasswordForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setPending(true)

    try {
      await apiPost('/api/auth/otp', { email })
      // Réponse volontairement identique que le compte existe ou non.
      toast.success('Si un compte existe pour cette adresse, un code vient d’être envoyé.')
      router.push(`/auth/nouveau-mot-de-passe?email=${encodeURIComponent(email)}`)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessayez.')
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
        placeholder="votreadresse@exemple.com"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        disabled={pending}
        className={formError ? 'mt-4' : undefined}
      />

      <Btn type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Envoi…' : 'Recevoir un code'}
      </Btn>
    </form>
  )
}
