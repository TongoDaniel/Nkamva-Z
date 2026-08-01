'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Btn } from '@/components/nk/btn'
import { AuthField } from '@/components/auth/auth-field'
import { FormError } from '@/components/form-error'

/** Messages d'erreur renvoyés par le provider Credentials. */
function messageForError(code: string): string {
  if (code === 'ACCOUNT_SUSPENDED') return 'Ce compte est suspendu. Contactez le support.'
  return 'Email ou mot de passe incorrect.'
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/mon-compte'

  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const justVerified = searchParams.get('verifie') === '1'
  useEffect(() => {
    if (justVerified) toast.success('Adresse vérifiée. Connectez-vous pour continuer.')
  }, [justVerified])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setPending(true)

    const result = await signIn('credentials', { redirect: false, email, password, callbackUrl })

    if (!result || result.error) {
      setFormError(messageForError(result?.error ?? ''))
      setPending(false)
      return
    }

    toast.success('Connexion réussie')
    router.replace(result.url && !result.url.includes('/auth/') ? result.url : callbackUrl)
    router.refresh()
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

      <AuthField
        label="Mot de passe"
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder="••••••••"
        required
        value={password}
        onChange={e => setPassword(e.target.value)}
        disabled={pending}
      />

      <div className="mb-5 flex items-center justify-end text-[13.5px]">
        <Link href="/auth/mot-de-passe-oublie" className="font-semibold text-brand hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>

      <Btn type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Connexion…' : 'Se connecter'}
      </Btn>
    </form>
  )
}
