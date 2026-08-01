'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/layout/brand'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[APP_ERROR]', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Brand />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Une erreur est survenue</h1>
        <p className="mt-2 text-muted-foreground">
          Le problème a été enregistré. Vous pouvez réessayer ou revenir à l’accueil.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Référence : {error.digest}</p>}
      </div>
      <div className="flex gap-3">
        <Button onClick={reset}>Réessayer</Button>
        <Button variant="outline" asChild>
          <a href="/">Retour à l’accueil</a>
        </Button>
      </div>
    </div>
  )
}
