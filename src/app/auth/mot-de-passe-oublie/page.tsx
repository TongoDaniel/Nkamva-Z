import Link from 'next/link'
import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = {
  title: 'Mot de passe oublié — NkamVa',
  description: 'Recevez un code pour réinitialiser le mot de passe de votre compte NkamVa.',
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Indiquez votre adresse : nous vous envoyons un code à 6 chiffres pour choisir un nouveau mot de passe."
      panelTitle="Reprendre la main"
      highlights={[
        { title: 'Code à usage unique', body: 'valable 10 minutes, utilisable une seule fois.' },
        { title: 'Sessions fermées', body: 'toutes vos sessions ouvertes tombent après la réinitialisation.' },
      ]}
      footer={
        <Link href="/auth/connexion" className="font-bold text-ink hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
