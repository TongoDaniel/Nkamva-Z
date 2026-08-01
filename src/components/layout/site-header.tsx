'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Brand } from './brand'

export function SiteHeader() {
  const { data: session, status } = useSession()
  const authenticated = status === 'authenticated' && !!session?.user

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* Le catalogue, l'annuaire des formateurs et les tarifs arrivent avec les lots
            suivants : pas de lien de navigation vers des pages qui n'existent pas. */}
        <Brand />

        <div className="flex items-center gap-2">
          {status === 'loading' ? (
            <div className="h-9 w-40 animate-pulse rounded-md bg-muted" aria-hidden />
          ) : authenticated ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/mon-compte">Mon compte</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: '/' })}>
                Se déconnecter
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth/connexion">Se connecter</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/auth/inscription">Créer un compte</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
