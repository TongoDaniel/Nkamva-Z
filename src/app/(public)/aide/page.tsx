import Link from 'next/link'
import type { Metadata } from 'next'
import { CreditCard, GraduationCap, Rocket, Users } from 'lucide-react'
import { Btn } from '@/components/nk/btn'
import { Faq } from '@/components/nk/faq'
import { SectionHead } from '@/components/nk/page-head'

export const metadata: Metadata = {
  title: 'Aide & FAQ — NkamVa',
  description: "Réponses sur les paiements, les communautés, l'espace formateur et bien plus.",
}

const TOPICS = [
  { icon: Rocket, title: 'Démarrer', description: 'Créer un compte, premiers pas' },
  { icon: CreditCard, title: 'Paiements', description: 'Mobile Money, FCFA, factures' },
  { icon: Users, title: 'Communautés', description: 'Rejoindre, participer, résilier' },
  { icon: GraduationCap, title: 'Espace formateur', description: 'Créer, vendre, retirer ses gains' },
]

const SECTIONS = [
  {
    title: 'Démarrer',
    items: [
      {
        question: 'Comment créer un compte sur NkamVa ?',
        answer: (
          <p>
            Cliquez sur « S&apos;inscrire », renseignez votre email et un mot de passe. La création de compte apprenant
            est gratuite et immédiate — aucun abonnement plateforme n&apos;est requis.
          </p>
        ),
      },
      {
        question: 'NkamVa est-il gratuit ?',
        answer: (
          <p>
            Oui pour les apprenants : le compte est gratuit, vous ne payez que les ressources que vous achetez à
            l&apos;unité ou les communautés auxquelles vous vous abonnez. Devenir formateur nécessite un abonnement
            mensuel ou annuel.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Paiements',
    items: [
      {
        question: 'Quels moyens de paiement acceptez-vous ?',
        answer: (
          <p>
            Wave, Orange Money, MTN MoMo, Airtel Money, M-Pesa, ainsi que la carte bancaire. Les opérateurs disponibles
            dépendent de votre pays.
          </p>
        ),
      },
      {
        question: 'Le paiement Mobile Money est-il sécurisé ?',
        answer: (
          <p>
            Oui. Les transactions sont traitées par un prestataire de paiement certifié ; NkamVa ne stocke jamais votre
            code secret Mobile Money.
          </p>
        ),
      },
      {
        question: 'Puis-je être remboursé ?',
        answer: (
          <p>
            Vous pouvez ouvrir un litige dans les 14 jours suivant l&apos;achat d&apos;une ressource, tant que vous
            n&apos;en avez pas consulté plus de 30 %. Les abonnements restent actifs jusqu&apos;à la fin de la période
            payée, sans remboursement au prorata.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Communautés',
    items: [
      {
        question: 'Comment rejoindre une communauté ?',
        answer: (
          <p>
            Depuis la fiche d&apos;une communauté, cliquez sur « Rejoindre la communauté » et réglez le prix mensuel
            fixé par le formateur. Vous accédez alors au forum, à la messagerie, aux ressources et aux lives.
          </p>
        ),
      },
      {
        question: 'Puis-je annuler mon abonnement à une communauté ?',
        answer: (
          <p>
            Oui, à tout moment depuis votre espace. La résiliation prend effet à la fin de la période déjà payée : vous
            conservez l&apos;accès jusque-là.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Espace formateur',
    items: [
      {
        question: 'Comment devenir formateur ?',
        answer: (
          <p>
            Déposez votre candidature depuis « Devenir formateur ». Chaque profil est examiné par notre équipe avant
            validation. Une fois approuvé, souscrivez à l&apos;abonnement formateur pour publier vos ressources et
            ouvrir votre communauté.
          </p>
        ),
      },
      {
        question: 'Comment retirer mes revenus ?',
        answer: (
          <p>
            Depuis votre tableau de bord revenus, demandez un retrait par mobile money. NkamVa prélève une commission de
            15 % sur chaque vente ; le solde net est versé sous quelques jours ouvrés.
          </p>
        ),
      },
    ],
  },
]

export default function HelpPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-navy via-[#123a68] to-brand py-14 text-white">
        <div className="wrap text-center">
          <h1 className="text-balance text-[clamp(28px,3.4vw,40px)] font-extrabold leading-[1.08] text-white">
            Comment pouvons-nous vous aider ?
          </h1>
          <p className="mx-auto mt-3 max-w-[52ch] text-[16.5px] leading-[1.6] text-[#b9c9dd]">
            Trouvez des réponses sur les paiements, les communautés, l&apos;espace formateur et bien plus.
          </p>
        </div>
      </section>

      <div className="wrap">
        <div className="-mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOPICS.map(topic => (
            <div key={topic.title} className="rounded-xl border border-line bg-card p-5 shadow-sm">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-t text-brand">
                <topic.icon className="size-5" />
              </span>
              <h2 className="mt-3 text-base font-bold">{topic.title}</h2>
              <p className="mt-1 text-[13.5px] text-ink2">{topic.description}</p>
            </div>
          ))}
        </div>

        <section className="pt-14">
          <SectionHead centered kicker="Questions fréquentes" title="Les réponses les plus demandées" />

          <div className="mx-auto max-w-[780px]">
            {SECTIONS.map(section => (
              <div key={section.title} className="mb-8">
                <h3 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.12em] text-ink3">
                  {section.title}
                </h3>
                <Faq items={section.items} />
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4 mt-6 rounded-xl border border-line bg-card p-8 text-center">
          <h2 className="text-[21px] font-extrabold">Vous n&apos;avez pas trouvé votre réponse ?</h2>
          <p className="mx-auto mt-2 max-w-[46ch] text-ink2">
            Notre équipe support vous répond en français sous 24 h.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Btn asChild>
              <Link href="/contact">Contacter le support</Link>
            </Btn>
            <Btn asChild variant="outline">
              <Link href="/communautes">Demander à la communauté</Link>
            </Btn>
          </div>
        </section>
      </div>
    </>
  )
}
