import { cn } from '@/lib/utils'
import { formatFcfa } from '@/features/demo/catalog-data'

/** Prix en FCFA : chiffres en display 800, devise en petit gris. */
export function Price({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn('font-display text-[19px] font-extrabold tracking-[-0.01em]', className)}>
      {formatFcfa(amount)}
      <small className="ml-1 text-xs font-bold text-ink3">FCFA</small>
    </span>
  )
}
