import Link from 'next/link'
import type { Metadata } from 'next'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/nk/btn'
import { Faq } from '@/components/nk/faq'
import { PayBand } from '@/components/nk/pay-band'
import { SectionHead } from '@/components/nk/page-head'

export const metadata: Metadata = {
  title: 'Tarifs — NkamVa',
  description: 'Payez en FCFA, par mobile money. Sans engagement, annulable à tout moment.',
}

const PLANS = [
  {
    name: 'Apprenant',
    description: "Un compte gratuit, des ressources à l'unité.",
    price: 'Gratuit',
    features: [
      'Compte gratuit, sans abonnement',
      "Chaque ressource s'achète à l'unité, en FCFA",
      'Accès permanent à vos achats',
      'Paiement mobile money',
      'Favoris & bibliothèque personnelle',
    ],
    cta: { label: 'Créer mon compte', href: '/auth/inscription', variant: 'outline' as const },
    featured: false,
  },
  {
    name: 'Communautés',
    description: "L'espace privé d'un formateur, en accès membre.",
    price: 'Selon la communauté',
    badge: 'Le cœur de NkamVa',
    features: [
      'Ressources réservées aux membres',
      'Lives & replays',
      'Forum et messagerie',
      'Événements de la communauté',
      'Tarif fixé par chaque formateur',
    ],
    cta: { label: 'Découvrir les communautés', href: '/communautes', variant: 'primary' as const },
    featured: true,
  },
  {
    name: 'Formateur',
    description: 'Pour créer, animer et monétiser votre savoir.',
    price: '15 000',
    priceSuffix: 'FCFA / mois',
    features: [
      'Publication de ressources illimitée',
      "Vente à l'unité ou en communauté",
      'Monétisation & retraits mobile money',
      'Tableau de bord revenus',
      'Communauté privée avec lives & replays',
    ],
    cta: { label: 'Devenir formateur', href: '/devenir-formateur', variant: 'dark' as const },
    featured: false,
  },
]

const FAQ_ITEMS = [
  {
    question: 'Le compte apprenant est-il vraiment gratuit ?',
    answer: (
      <p>
        Oui. Vous ne payez que les ressources que vous achetez, à l&apos;unité. Aucun abonnement n&apos;est requis pour
        acheter, consulter vos achats ou gérer vos favoris.
      </p>
    ),
  },
  {
    question: 'Quelle commission NkamVa prélève-t-elle sur les ventes ?',
    answer: (
      <p>
        15 % du prix payé. Le formateur est crédité de 85 % au moment de la vente, quel que soit le canal — vente
        directe ou communauté.
      </p>
    ),
  },
  {
    question: 'Puis-je résilier mon abonnement formateur ?',
    answer: (
      <p>
        À tout moment, depuis votre espace formateur. Vos ressources déjà vendues restent accessibles à ceux qui les ont
        achetées.
      </p>
    ),
  },
]

export default function PricingPage() {
  return (
    <>
      <div className="wrap pt-11">
        <div className="mx-auto max-w-[640px] text-center">
          <h1 className="text-balance text-[clamp(30px,3.6vw,42px)] font-extrabold leading-[1.08]">
            Des tarifs pensés pour l&apos;Afrique
          </h1>
          <p className="mt-3 text-[16.5px] leading-[1.6] text-ink2">
            Payez en FCFA, par mobile money. Sans engagement, annulable à tout moment.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={cn(
                'relative flex flex-col rounded-xl border bg-card p-7',
                plan.featured ? 'border-brand shadow-md lg:-mt-3 lg:pb-10 lg:pt-10' : 'border-line shadow-sm',
              )}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
                  {plan.badge}
                </span>
              )}

              <h2 className="text-[21px] font-extrabold">{plan.name}</h2>
              <p className="mt-1 text-sm text-ink2">{plan.description}</p>

              <div className="mt-5 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em]">
                {plan.price}
                {plan.priceSuffix && <small className="ml-1.5 text-[13px] font-bold text-ink3">{plan.priceSuffix}</small>}
              </div>

              <ul className="mt-6 grid flex-1 gap-3 border-t border-line2 pt-5">
                {plan.features.map(feature => (
                  <li key={feature} className="flex items-start gap-2.5 text-[14px] leading-[1.5] text-ink2">
                    <CheckCircle2 className="mt-px size-[18px] flex-none text-brand" strokeWidth={2.4} />
                    {feature}
                  </li>
                ))}
              </ul>

              <Btn asChild variant={plan.cta.variant} className="mt-6 w-full">
                <Link href={plan.cta.href}>{plan.cta.label}</Link>
              </Btn>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-14">
        <PayBand />
      </div>

      <section className="pt-14 sm:pt-[76px]">
        <div className="wrap">
          <SectionHead centered kicker="Questions fréquentes" title="Ce que vous payez, exactement" />
          <Faq items={FAQ_ITEMS} />
        </div>
      </section>
    </>
  )
}
