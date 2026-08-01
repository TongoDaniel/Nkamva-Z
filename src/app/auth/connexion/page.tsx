import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AuthShell, LEARNER_HIGHLIGHTS } from '@/components/auth/auth-shell'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Connexion — NkamVa',
  description: 'Connectez-vous à votre compte NkamVa.',
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Bon retour"
      subtitle="Connectez-vous pour reprendre votre apprentissage."
      highlights={LEARNER_HIGHLIGHTS}
      panelTitle="Votre espace vous attend"
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link href="/auth/inscription" className="font-bold text-ink hover:underline">
            Créer un compte
          </Link>
        </>
      }
      back={{ href: '/', label: "Retour à l'accueil" }}
    >
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-line2" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
