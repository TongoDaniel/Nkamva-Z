import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  href?: string
}

/** En-tête de page interne : fil d'ariane, titre, chapeau (`.pagehead`). */
export function PageHead({
  crumbs,
  title,
  lead,
  children,
  className,
}: {
  crumbs?: Crumb[]
  title: React.ReactNode
  lead?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('pt-[34px] pb-2', className)}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Fil d’ariane" className="mb-3.5 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink3">
          {crumbs.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="size-3.5 opacity-55" />}
              {crumb.href ? (
                <Link href={crumb.href} className="text-ink2 hover:text-brand">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <h1 className="text-balance text-[clamp(28px,3.4vw,40px)] font-extrabold leading-[1.06]">{title}</h1>
      {lead && <p className="mt-2 max-w-[60ch] text-pretty text-base leading-[1.55] text-ink2">{lead}</p>}
      {children}
    </div>
  )
}

/** En-tête de section d'une page vitrine (`.shead`). */
export function SectionHead({
  kicker,
  title,
  children,
  centered = false,
  className,
}: {
  kicker?: string
  title: React.ReactNode
  children?: React.ReactNode
  centered?: boolean
  className?: string
}) {
  return (
    <div className={cn('mb-9 max-w-[640px]', centered && 'mx-auto text-center', className)}>
      {kicker && <Kicker>{kicker}</Kicker>}
      <h2 className="text-balance text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.1]">{title}</h2>
      {children && <p className="mt-2.5 text-pretty text-base leading-[1.6] text-ink2">{children}</p>}
    </div>
  )
}

/** Suramorce en capitales au-dessus d'un titre (`.kick`). */
export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('mb-3.5 text-xs font-bold uppercase tracking-[0.14em] text-clay', className)}>{children}</p>
  )
}
