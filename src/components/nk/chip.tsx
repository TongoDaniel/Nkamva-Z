import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** Pastille de catégorie / statut (`.chip` de la maquette). */
const chipVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
  {
    variants: {
      tone: {
        brand: 'bg-brand-t text-brand',
        clay: 'bg-clay-t text-clay',
        gold: 'bg-gold-t text-gold',
        info: 'bg-info-t text-[#2b5fa8]',
        danger: 'bg-danger-t text-danger',
        muted: 'bg-line2 text-ink2',
      },
    },
    defaultVariants: { tone: 'brand' },
  },
)

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

export function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ tone }), className)} {...props} />
}

/** Teinte de pastille par catégorie de ressource, comme dans la maquette. */
export const CATEGORY_TONE = {
  dev: 'brand',
  business: 'clay',
  design: 'info',
  marketing: 'gold',
} as const

export type CategoryKey = keyof typeof CATEGORY_TONE
