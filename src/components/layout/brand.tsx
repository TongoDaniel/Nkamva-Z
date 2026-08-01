import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/** Logo NkamVa : marque bleu marine + mot-symbole, « Va » en accent. */
export function Brand({
  className,
  href = '/',
  /** Le mot est masqué sous 860px dans la topbar de la maquette. */
  hideWordOnMobile = false,
}: {
  className?: string
  href?: string
  hideWordOnMobile?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2.5 font-display text-[21px] font-extrabold tracking-[-0.01em] text-ink hover:text-ink',
        className,
      )}
    >
      <Image src="/mark.svg" alt="" width={36} height={36} className="size-9 shrink-0 rounded-[11px]" priority />
      <span className={cn(hideWordOnMobile && 'hidden sm:inline')}>
        Nkam<em className="not-italic text-brand">Va</em>
      </span>
    </Link>
  )
}
