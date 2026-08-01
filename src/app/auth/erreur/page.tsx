import Link from 'next/link'
import type { Metadata } from 'next'
import { Btn } from '@/components/nk/btn'
import { AuthShell } from '@/components/auth/auth-shell'
import { FormError } from '@/components/form-error'

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
    <AuthShell
      title="Connexion impossible"
      subtitle="Nous n'avons pas pu ouvrir votre session."
      panelTitle="Besoin d'aide ?"
      highlights={[
        { title: 'Mot de passe oublié', body: 'un code de réinitialisation vous est envoyé par email.' },
        { title: 'Support', body: 'écrivez-nous depuis la page contact, réponse sous 24 h.' },
      ]}
      back={{ href: '/', label: "Retour à l'accueil" }}
    >
      <FormError message={message} />

      <div className="mt-5 grid gap-2.5">
        <Btn asChild size="lg">
          <Link href="/auth/connexion">Réessayer</Link>
        </Btn>
        <Btn asChild variant="outline">
          <Link href="/contact">Contacter le support</Link>
        </Btn>
      </div>
    </AuthShell>
  )
}
