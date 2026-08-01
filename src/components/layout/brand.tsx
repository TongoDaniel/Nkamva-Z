import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Brand({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground text-sm font-bold"
      >
        N
      </span>
      <span className="text-lg">NkamVa</span>
    </Link>
  )
}
