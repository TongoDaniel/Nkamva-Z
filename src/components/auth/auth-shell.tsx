import Link from 'next/link'
import { ArrowLeft, Check } from 'lucide-react'
import { Brand } from '@/components/layout/brand'

export interface AuthHighlight {
  title: string
  body: string
}

/**
 * Gabarit des écrans d'authentification : formulaire à gauche, panneau dégradé à
 * droite (masqué sous 920px, comme dans la maquette).
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  back,
  highlights,
  panelTitle = 'Pourquoi créer un compte ?',
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  back?: { href: string; label: string }
  highlights?: AuthHighlight[]
  panelTitle?: string
}) {
  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-2">
      <div className="relative flex flex-col justify-center px-6 py-10 sm:px-16 sm:py-14">
        <Brand className="mb-6 lg:absolute lg:left-16 lg:top-10 lg:mb-0" />

        <div className="mx-auto w-full max-w-[400px]">
          <h1 className="mb-2 text-[27px] font-extrabold lg:mt-11">{title}</h1>
          {subtitle && <p className="mb-7 text-[15px] leading-[1.55] text-ink2">{subtitle}</p>}

          {children}

          {footer && <div className="mt-5 text-center text-sm text-ink2">{footer}</div>}

          {back && (
            <Link
              href={back.href}
              className="mt-[18px] inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink"
            >
              <ArrowLeft className="size-[15px]" />
              {back.label}
            </Link>
          )}
        </div>
      </div>

      <div className="relative m-3.5 ml-0 hidden overflow-hidden rounded-[22px] bg-gradient-to-br from-navy to-brand lg:block">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              'radial-gradient(600px 300px at 20% 10%, rgba(46,124,246,.45), transparent 60%), radial-gradient(500px 400px at 90% 90%, rgba(46,124,246,.3), transparent 60%)',
          }}
        />

        {highlights && (
          <div className="absolute inset-x-10 top-10 grid gap-4">
            <h2 className="text-[17px] font-extrabold text-white">{panelTitle}</h2>
            {highlights.map(item => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="mt-px grid size-7 flex-none place-items-center rounded-lg bg-white/15 text-white">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <p className="text-[14.5px] leading-[1.45] text-[#eaf0fb]">
                  <b className="font-bold text-white">{item.title}</b> — {item.body}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(2,20,40,.75)] to-transparent p-8">
          <p className="max-w-[420px] font-display text-[19px] font-bold leading-[1.35] text-white">
            « Une plateforme simple, rapide et efficace. »
          </p>
          <span className="text-[13px] text-[#dfe7e2]">Un apprenant NkamVa</span>
        </div>
      </div>
    </div>
  )
}

export const LEARNER_HIGHLIGHTS: AuthHighlight[] = [
  { title: 'Gratuit', body: 'aucun abonnement pour acheter une ressource à l’unité.' },
  { title: 'Accès à vie', body: 'vos achats restent dans votre espace, progression conservée.' },
  { title: 'Mobile money', body: 'payez en FCFA depuis votre opérateur habituel.' },
]
