import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AuthShell, LEARNER_HIGHLIGHTS } from '@/components/auth/auth-shell'
import { RegisterForm } from './register-form'

export const metadata: Metadata = {
  title: 'Créer un compte — NkamVa',
  description: 'Créez votre compte NkamVa pour accéder aux ressources des formateurs.',
}

export default function RegisterPage() {
  return (
    <AuthShell
      title="Créer votre compte"
      subtitle="Quelques informations suffisent. Le compte apprenant est gratuit."
      highlights={LEARNER_HIGHLIGHTS}
      footer={
        <>
          Vous avez déjà un compte ?{' '}
          <Link href="/auth/connexion" className="font-bold text-ink hover:underline">
            Se connecter
          </Link>
        </>
      }
      back={{ href: '/', label: "Retour à l'accueil" }}
    >
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-line2" />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  )
}
