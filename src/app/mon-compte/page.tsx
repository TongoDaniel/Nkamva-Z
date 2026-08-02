import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PublicShell } from '@/components/layouts/public-shell'
import { SignOutButton } from './sign-out-button'

export const metadata: Metadata = {
  title: 'Mon compte — NkamVa',
}

const ROLE_LABELS: Record<string, string> = {
  LEARNER: 'Apprenant',
  PENDING_TRAINER: 'Candidature formateur en cours',
  TRAINER: 'Formateur',
  ADMIN: 'Administrateur',
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/auth/connexion?callbackUrl=/mon-compte')

  const { erreur } = await searchParams

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, fullName: true, role: true, adminRole: true, emailVerifiedAt: true, createdAt: true },
  })
  if (!user) redirect('/auth/connexion')

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Mon compte</h1>

        {erreur === 'acces-refuse' && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Vous n’avez pas les droits nécessaires pour accéder à cette page.
          </p>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{user.fullName ?? 'Compte NkamVa'}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{ROLE_LABELS[user.role] ?? user.role}</Badge>
              {user.adminRole && <Badge variant="outline">{user.adminRole}</Badge>}
              <Badge variant={user.emailVerifiedAt ? 'default' : 'destructive'}>
                {user.emailVerifiedAt ? 'Email vérifié' : 'Email non vérifié'}
              </Badge>
            </div>

            <Separator />

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Membre depuis</dt>
                <dd>{dateFormat.format(user.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Identifiant du compte</dt>
                <dd className="font-mono text-xs break-all">{session.user.id}</dd>
              </div>
            </dl>

            <Separator />

            <SignOutButton />
          </CardContent>
        </Card>

        <p className="mt-6 text-sm text-muted-foreground">
          L’espace apprenant (achats, ressources, litiges) et l’espace formateur arrivent avec les lots suivants.
        </p>
      </div>
    </PublicShell>
  )
}
