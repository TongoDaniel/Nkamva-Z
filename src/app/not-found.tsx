import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/layout/brand'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Brand />
      <div>
        <p className="text-sm font-medium text-muted-foreground">Erreur 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Cette page n’existe pas</h1>
        <p className="mt-2 text-muted-foreground">Le lien est peut-être obsolète ou la page a été déplacée.</p>
      </div>
      <Button asChild>
        <Link href="/">Retour à l’accueil</Link>
      </Button>
    </div>
  )
}
