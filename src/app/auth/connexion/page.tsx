import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from './login-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Connexion — NkamVa',
  description: 'Connectez-vous à votre compte NkamVa.',
}

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Se connecter</CardTitle>
        <CardDescription>Accédez à vos ressources et à votre espace formateur.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted" />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
