'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError } from '@/components/form-error'
import { ApiError, apiPost } from '@/lib/http'

const PASSWORD_MIN_LENGTH = 10

export function ResetPasswordFlow() {
  const router = useRouter()

  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  function handleApiError(err: unknown) {
    if (err instanceof ApiError) {
      setFormError(err.message)
      setFieldErrors(err.fieldErrors())
      return
    }
    setFormError('Une erreur est survenue. Réessayez.')
  }

  async function handleRequestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})
    setPending(true)

    try {
      await apiPost('/api/auth/otp', { email })
      // Réponse volontairement identique que le compte existe ou non.
      toast.success('Si un compte existe pour cette adresse, un code vient d’être envoyé.')
      setStep('reset')
    } catch (err) {
      handleApiError(err)
    } finally {
      setPending(false)
    }
  }

  async function handleReset(event: React.FormEvent<HTMLFormElement>) {
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
      router.replace('/auth/connexion')
    } catch (err) {
      handleApiError(err)
      setPending(false)
    }
  }

  if (step === 'reset') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Nouveau mot de passe</CardTitle>
          <CardDescription>
            Saisissez le code reçu à <span className="font-medium text-foreground">{email}</span> et choisissez un
            nouveau mot de passe. Toutes vos sessions ouvertes seront fermées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4" noValidate>
            <FormError message={formError} />

            <div className="space-y-2">
              <Label htmlFor="code">Code reçu par email</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={pending}
                className="text-center text-lg tracking-[0.5em]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={pending}
                aria-invalid={!!fieldErrors.password}
              />
              <p className="text-xs text-muted-foreground">{PASSWORD_MIN_LENGTH} caractères minimum.</p>
              {fieldErrors.password && <p className="text-sm text-destructive">{fieldErrors.password}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">Confirmer le mot de passe</Label>
              <Input
                id="passwordConfirm"
                name="passwordConfirm"
                type="password"
                autoComplete="new-password"
                required
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                disabled={pending}
                aria-invalid={!!fieldErrors.passwordConfirm}
              />
              {fieldErrors.passwordConfirm && <p className="text-sm text-destructive">{fieldErrors.passwordConfirm}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
              {pending ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
            </Button>

            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep('email')} disabled={pending}>
              Changer d’adresse email
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Mot de passe oublié</CardTitle>
        <CardDescription>Nous vous enverrons un code à 6 chiffres pour réinitialiser votre mot de passe.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRequestCode} className="space-y-4" noValidate>
          <FormError message={formError} />

          <div className="space-y-2">
            <Label htmlFor="email">Adresse email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={pending}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && <p className="text-sm text-destructive">{fieldErrors.email}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Envoi…' : 'Recevoir un code'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/auth/connexion" className="font-medium text-foreground hover:underline">
              Retour à la connexion
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
