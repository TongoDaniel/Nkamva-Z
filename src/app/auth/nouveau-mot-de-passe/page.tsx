import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { NewPasswordForm } from './new-password-form'

export const metadata: Metadata = {
  title: 'Nouveau mot de passe — NkamVa',
  description: 'Choisissez un nouveau mot de passe pour votre compte NkamVa.',
}

export default function NewPasswordPage() {
  return (
    <AuthShell
      title="Nouveau mot de passe"
      subtitle="Saisissez le code reçu par email, puis choisissez votre nouveau mot de passe."
      panelTitle="Un compte bien protégé"
      highlights={[
        { title: 'Chiffrement', body: 'les mots de passe sont hachés en argon2id, jamais stockés en clair.' },
        { title: 'Sessions fermées', body: 'après la réinitialisation, il faut se reconnecter partout.' },
      ]}
      back={{ href: '/auth/mot-de-passe-oublie', label: 'Demander un autre code' }}
    >
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-line2" />}>
        <NewPasswordForm />
      </Suspense>
    </AuthShell>
  )
}
