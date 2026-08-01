import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { VerifyCodeForm } from './verify-code-form'

export const metadata: Metadata = {
  title: 'Vérifier votre adresse — NkamVa',
  description: 'Saisissez le code à 6 chiffres reçu par email.',
}

export default function VerifyCodePage() {
  return (
    <AuthShell
      title="Vérifiez votre adresse"
      subtitle="Nous venons de vous envoyer un code à 6 chiffres. Il expire dans 10 minutes."
      panelTitle="Presque terminé"
      highlights={[
        { title: 'Pourquoi ce code', body: 'il confirme que cette adresse est bien la vôtre.' },
        { title: 'Pas reçu ?', body: 'vérifiez vos indésirables, puis demandez un nouveau code.' },
      ]}
      back={{ href: '/auth/inscription', label: "Revenir à l'inscription" }}
    >
      <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-line2" />}>
        <VerifyCodeForm />
      </Suspense>
    </AuthShell>
  )
}
