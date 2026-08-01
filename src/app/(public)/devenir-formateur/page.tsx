import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { BadgeCheck, FileVideo, IdCard, Wallet } from 'lucide-react'
import { Btn } from '@/components/nk/btn'
import { Faq } from '@/components/nk/faq'
import { Kicker, SectionHead } from '@/components/nk/page-head'

export const metadata: Metadata = {
  title: 'Devenir formateur — NkamVa',
  description: 'Publiez vos ressources, fixez vos prix en FCFA et retirez vos revenus par mobile money.',
}

const STEPS = [
  {
    icon: IdCard,
    title: 'Déposez votre candidature',
    body: "Identité, diplôme ou preuve d'expérience, et une courte vidéo de présentation. Comptez dix minutes.",
  },
  {
    icon: BadgeCheck,
    title: 'Notre équipe examine votre dossier',
    body: 'Chaque candidature est revue par un humain. Vous recevez une réponse motivée, et pouvez corriger un document refusé.',
  },
  {
    icon: FileVideo,
    title: 'Publiez vos ressources',
    body: 'PDF, vidéo, kits, modèles Notion ou tableurs. Vous fixez le prix de chaque ressource, en FCFA.',
  },
  {
    icon: Wallet,
    title: 'Retirez vos revenus',
    body: 'Vos ventes créditent votre portefeuille. Demandez un retrait mobile money depuis votre espace formateur.',
  },
]

const FAQ_ITEMS = [
  {
    question: 'Quels documents dois-je fournir ?',
    answer: (
      <p>
        Une pièce d&apos;identité en cours de validité, un diplôme ou une preuve d&apos;expérience dans votre domaine,
        et une vidéo de présentation de deux minutes. Vos pièces d&apos;identité sont supprimées 90 jours après la
        décision.
      </p>
    ),
  },
  {
    question: 'Dois-je fournir un RIB dès la candidature ?',
    answer: (
      <p>
        Non. Vos coordonnées bancaires ou mobile money ne sont demandées qu&apos;au moment de votre premier retrait —
        elles ne servent à rien avant.
      </p>
    ),
  },
  {
    question: 'Combien NkamVa prélève-t-elle ?',
    answer: (
      <p>
        15 % du prix payé par l&apos;apprenant. Vous êtes crédité de 85 % au moment de la vente, que celle-ci vienne du
        catalogue ou de votre communauté.
      </p>
    ),
  },
  {
    question: 'Que se passe-t-il si ma candidature est refusée ?',
    answer: (
      <p>
        Vous recevez le motif du refus. Si un document seul pose problème, vous pouvez le remplacer et re-soumettre
        votre dossier sans tout recommencer.
      </p>
    ),
  },
]

export default function BecomeTrainerPage() {
  return (
    <>
      <section className="pt-11">
        <div className="wrap grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <Kicker>Devenir formateur</Kicker>
            <h1 className="text-balance text-[clamp(30px,3.8vw,46px)] font-extrabold leading-[1.06]">
              Votre expertise a de la valeur. <em className="not-italic text-brand">Vendez-la.</em>
            </h1>
            <p className="mt-5 max-w-[54ch] text-pretty text-[16.5px] leading-[1.6] text-ink2">
              Transformez ce que vous savez en guides, cours vidéo ou modèles, vendus à l&apos;unité en FCFA. Vous
              fixez vos prix, vous gardez la main sur votre contenu, et vous êtes payé par mobile money.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Btn asChild size="lg">
                <Link href="/auth/inscription?role=formateur">Déposer ma candidature</Link>
              </Btn>
              <Btn asChild size="lg" variant="outline">
                <Link href="/tarifs">Voir les tarifs</Link>
              </Btn>
            </div>
            <p className="mt-3.5 text-[13px] text-ink3">Chaque candidature est examinée avant publication.</p>
          </div>

          <div className="relative aspect-[16/11] overflow-hidden rounded-[28px] border border-line shadow-md">
            <Image
              src="/formateurs.webp"
              alt="Formateurs en atelier autour d'un ordinateur"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 520px"
              priority
            />
          </div>
        </div>
      </section>

      <section className="pt-14 sm:pt-[76px]">
        <div className="wrap">
          <SectionHead
            kicker="Le parcours"
            title={
              <>
                Quatre étapes, <em className="not-italic text-brand">pas une de plus</em>
              </>
            }
          >
            De la candidature au premier retrait, voici exactement ce qui vous attend.
          </SectionHead>

          <div className="grid gap-5 sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <div key={step.title} className="rounded-xl border border-line bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-t text-brand">
                    <step.icon className="size-5" />
                  </span>
                  <span className="font-display text-[26px] font-extrabold text-brand opacity-30">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-4 text-[17px] font-bold">{step.title}</h3>
                <p className="mt-1.5 text-[14.5px] leading-[1.55] text-ink2">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pt-14 sm:pt-[76px]">
        <div className="wrap">
          <SectionHead centered kicker="Questions fréquentes" title="Avant de candidater" />
          <Faq items={FAQ_ITEMS} />
        </div>
      </section>

      <section className="relative mt-[84px] overflow-hidden bg-navy">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(760px 340px at 50% -60px, rgba(46,124,246,.28), transparent 65%)' }}
        />
        <div className="relative mx-auto max-w-[720px] px-5 pb-16 pt-[72px] text-center">
          <h2 className="text-balance text-[clamp(26px,3.2vw,36px)] font-extrabold leading-[1.1] text-white">
            Prêt à transmettre ?
          </h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-[16.5px] leading-[1.6] text-[#b9c9dd]">
            Créez votre compte, puis déposez votre candidature formateur. Dix minutes suffisent.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Btn asChild size="lg" variant="light">
              <Link href="/auth/inscription?role=formateur">Créer mon compte formateur</Link>
            </Btn>
            <Btn asChild size="lg" variant="ghostOnDark">
              <Link href="/aide">Consulter l&apos;aide</Link>
            </Btn>
          </div>
        </div>
      </section>
    </>
  )
}
