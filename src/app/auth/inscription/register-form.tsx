'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Btn } from '@/components/nk/btn'
import { AuthField } from '@/components/auth/auth-field'
import { FormError } from '@/components/form-error'
import { ApiError, apiPost } from '@/lib/http'

const PASSWORD_MIN_LENGTH = 10

export function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  /** `?role=formateur` vient de « Devenir formateur » : on adapte seulement le discours. */
  const wantsTrainer = searchParams.get('role') === 'formateur'

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [accepted, setAccepted] = useState(false)

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
    if (!accepted) {
      setFormError("Vous devez accepter les conditions d'utilisation pour créer un compte.")
      return
    }

    setPending(true)
    try {
      await apiPost('/api/auth/register', { email, password, fullName })
      toast.success('Compte créé. Un code de vérification vous a été envoyé.')
      router.push(`/auth/verifier-code?email=${encodeURIComponent(email)}`)
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

      {wantsTrainer && (
        <p className="mb-4 rounded-xl border border-brand-t2 bg-brand-t px-3.5 py-2.5 text-[13px] font-medium text-brand-d">
          Créez d&apos;abord votre compte : la candidature formateur se dépose ensuite depuis votre espace.
        </p>
      )}

      <AuthField
        label="Nom complet"
        name="fullName"
        autoComplete="name"
        placeholder="Awa Traoré"
        required
        value={fullName}
        onChange={e => setFullName(e.target.value)}
        disabled={pending}
        error={fieldErrors.fullName}
        className={formError ? 'mt-4' : undefined}
      />

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
        error={fieldErrors.email}
      />

      <AuthField
        label="Mot de passe"
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

      <label className="mb-5 flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink2">
        <input
          type="checkbox"
          checked={accepted}
          onChange={e => setAccepted(e.target.checked)}
          className="mt-[3px] size-4 flex-none accent-brand"
        />
        <span>
          J&apos;accepte les{' '}
          <Link href="/legal/conditions" className="font-semibold text-brand hover:underline">
            conditions d&apos;utilisation
          </Link>{' '}
          et la{' '}
          <Link href="/legal/confidentialite" className="font-semibold text-brand hover:underline">
            politique de confidentialité
          </Link>
          .
        </span>
      </label>

      <Btn type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Création…' : 'Créer mon compte'}
      </Btn>
    </form>
  )
}
