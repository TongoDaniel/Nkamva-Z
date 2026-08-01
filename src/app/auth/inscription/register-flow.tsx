'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError } from '@/components/form-error'
import { ApiError, apiPost } from '@/lib/http'

const PASSWORD_MIN_LENGTH = 10

export function RegisterFlow() {
  const router = useRouter()

  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [code, setCode] = useState('')

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

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
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
      await apiPost('/api/auth/register', { email, password, fullName })
      toast.success('Compte créé. Un code de vérification vous a été envoyé.')
      setStep('otp')
    } catch (err) {
      handleApiError(err)
    } finally {
      setPending(false)
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})
    setPending(true)

    try {
      await apiPost('/api/auth/verify-otp', { email, code })
    } catch (err) {
      handleApiError(err)
      setPending(false)
      return
    }

    // Le mot de passe est encore en mémoire : on ouvre la session sans redemander.
    const result = await signIn('credentials', { redirect: false, email, password })
    if (!result || result.error) {
      toast.success('Adresse vérifiée. Connectez-vous pour continuer.')
      router.replace('/auth/connexion')
      return
    }

    toast.success('Bienvenue sur NkamVa')
    router.replace('/mon-compte')
    router.refresh()
  }

  async function handleResend() {
    setFormError(null)
    setPending(true)
    try {
      await apiPost('/api/auth/otp', { email })
      toast.success('Nouveau code envoyé')
    } catch (err) {
      handleApiError(err)
    } finally {
      setPending(false)
    }
  }

  if (step === 'otp') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Vérifiez votre adresse</CardTitle>
          <CardDescription>
            Nous avons envoyé un code à 6 chiffres à <span className="font-medium text-foreground">{email}</span>. Il
            expire dans 10 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4" noValidate>
            <FormError message={formError} />

            <div className="space-y-2">
              <Label htmlFor="code">Code de vérification</Label>
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

            <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
              {pending ? 'Vérification…' : 'Vérifier'}
            </Button>

            <Button type="button" variant="ghost" className="w-full" onClick={handleResend} disabled={pending}>
              Renvoyer le code
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Créer un compte</CardTitle>
        <CardDescription>Quelques informations suffisent pour commencer.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="space-y-4" noValidate>
          <FormError message={formError} />

          <div className="space-y-2">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              disabled={pending}
              aria-invalid={!!fieldErrors.fullName}
            />
            {fieldErrors.fullName && <p className="text-sm text-destructive">{fieldErrors.fullName}</p>}
          </div>

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

          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
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

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Création…' : 'Créer mon compte'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Vous avez déjà un compte ?{' '}
            <Link href="/auth/connexion" className="font-medium text-foreground hover:underline">
              Se connecter
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
