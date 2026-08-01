import Link from 'next/link'
import { BookOpen, ShieldCheck, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'

const PILLARS = [
  {
    icon: BookOpen,
    title: 'Des ressources qui vous appartiennent',
    body: "Cours, PDF, vidéos : ce que vous achetez reste accessible dans votre espace, sans abonnement obligatoire.",
  },
  {
    icon: ShieldCheck,
    title: 'Des formateurs vérifiés',
    body: "Pièce d'identité, diplôme et présentation vidéo sont contrôlés avant la première publication.",
  },
  {
    icon: Wallet,
    title: 'Paiements locaux et internationaux',
    body: 'Mobile Money et carte bancaire, en FCFA comme en euro, avec un litige ouvrable pendant 14 jours.',
  },
]

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">Plateforme de formation en ligne</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Apprendre auprès de formateurs vérifiés, et être payé pour transmettre.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground text-pretty">
              NkamVa réunit apprenants et formateurs indépendants : achat de ressources à l&apos;unité, communautés
              d&apos;entraide, et reversement des ventes directement au formateur.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/auth/inscription">Créer un compte</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/auth/connexion">J&apos;ai déjà un compte</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-3">
            {PILLARS.map(pillar => (
              <div key={pillar.title}>
                <pillar.icon className="size-5 text-muted-foreground" aria-hidden />
                <h2 className="mt-4 font-medium">{pillar.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground text-pretty">{pillar.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
