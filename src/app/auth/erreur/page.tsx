import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Erreur d’authentification — NkamVa',
}

/** Page pointée par `authOptions.pages.error`. */
const MESSAGES: Record<string, string> = {
  CredentialsSignin: 'Email ou mot de passe incorrect.',
  ACCOUNT_SUSPENDED: 'Ce compte est suspendu. Contactez le support.',
  SessionRequired: 'Cette page demande une session active.',
  Configuration: "Le service d'authentification est mal configuré. Réessayez plus tard.",
  AccessDenied: 'Accès refusé.',
}

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const message = (error && MESSAGES[error]) || "La connexion n'a pas pu aboutir."

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Connexion impossible</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild className="w-full">
          <Link href="/auth/connexion">Réessayer</Link>
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/">Retour à l’accueil</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
