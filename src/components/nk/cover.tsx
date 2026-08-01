import { FileText, LayoutTemplate, Package, Play, Table } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CategoryId, Format } from '@/features/demo/catalog-data'

/** Rayures diagonales teintées par catégorie, comme `.cover` dans la maquette. */
const COVER_TINTS: Record<CategoryId, [string, string]> = {
  dev: ['#dcebe3', '#e6f1ea'],
  biz: ['#f4e4d4', '#f8ecdf'],
  dsg: ['#e2e9f4', '#eaf0f8'],
  mkt: ['#f2e8d2', '#f7efdd'],
}

const FORMAT_ICONS = {
  play: Play,
  'file-text': FileText,
  package: Package,
  layout: LayoutTemplate,
  table: Table,
} as const

export interface CoverProps {
  category: CategoryId
  format: Format
  /** Étiquette en haut à gauche : « VIDÉO · 4 H 20 ». */
  label?: string
  className?: string
  glyphClassName?: string
  children?: React.ReactNode
}

export function Cover({ category, format, label, className, glyphClassName, children }: CoverProps) {
  const [a, b] = COVER_TINTS[category]
  const Icon = FORMAT_ICONS[format.icon]

  return (
    <div
      className={cn('relative grid aspect-video place-items-center overflow-hidden', className)}
      style={{ background: `repeating-linear-gradient(-52deg, ${a} 0 14px, ${b} 14px 28px)` }}
    >
      {label && (
        <span className="absolute left-3 top-3 rounded-full bg-ink/85 px-2.5 py-1.5 text-[11px] font-bold leading-none tracking-[0.06em] text-paper backdrop-blur-[3px]">
          {label}
        </span>
      )}
      <div
        className={cn(
          'grid size-16 place-items-center rounded-[18px] bg-card/80 text-ink2 shadow-sm backdrop-blur-[3px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.3,1.2)] group-hover:scale-110 group-hover:-rotate-3',
          glyphClassName,
        )}
      >
        <Icon className="size-7" strokeWidth={1.8} />
      </div>
      {children}
    </div>
  )
}
