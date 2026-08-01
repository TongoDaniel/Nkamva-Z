import Link from 'next/link'
import { Brand } from './brand'

const COLUMNS = [
  {
    title: 'Plateforme',
    links: [
      { href: '/ressources', label: 'Ressources' },
      { href: '/communautes', label: 'Communautés' },
      { href: '/formateurs', label: 'Formateurs' },
      { href: '/tarifs', label: 'Tarifs' },
    ],
  },
  {
    title: 'Formateurs',
    links: [
      { href: '/devenir-formateur', label: 'Devenir formateur' },
      { href: '/aide', label: 'Aide & FAQ' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { href: '/legal/conditions', label: "Conditions d'utilisation" },
      { href: '/legal/confidentialite', label: 'Confidentialité' },
      { href: '/legal/mentions', label: 'Mentions légales' },
      { href: '/contact', label: 'Contact' },
    ],
  },
]

/** Pied de page à 4 colonnes (`.bigfoot`). */
export function SiteFooter() {
  return (
    <footer className="mt-[72px] border-t border-line bg-card">
      <div className="wrap grid gap-10 py-[52px] sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Brand />
          <p className="mt-3 max-w-[34ch] text-sm leading-[1.6] text-ink2">
            Apprendre et former à l&apos;unité, en FCFA, par mobile money ou carte bancaire.
          </p>
        </div>

        {COLUMNS.map(column => (
          <div key={column.title}>
            <h4 className="mb-3.5 mt-1.5 font-sans text-xs font-bold uppercase tracking-[0.12em] text-ink3">
              {column.title}
            </h4>
            <ul className="grid gap-2.5">
              {column.links.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm font-semibold text-ink2 hover:text-brand">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line2">
        <div className="wrap flex flex-wrap items-center justify-between gap-3.5 py-[18px] text-[13px] text-ink3">
          <p>© {new Date().getFullYear()} NkamVa</p>
          <p>Paiement à l&apos;unité en FCFA · mobile money &amp; carte bancaire</p>
        </div>
      </div>
    </footer>
  )
}
