'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Mot de passe</Label>
          <Link href="/auth/mot-de-passe-oublie" className="text-sm text-muted-foreground hover:text-foreground">
            Mot de passe oublié ?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={pending}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Connexion…' : 'Se connecter'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link href="/auth/inscription" className="font-medium text-foreground hover:underline">
          Créer un compte
        </Link>
      </p>
    </form>
  )
}
