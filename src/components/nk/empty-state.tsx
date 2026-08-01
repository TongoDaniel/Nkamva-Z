import { cn } from '@/lib/utils'

/** État vide encadré en pointillés (`.empty`). */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('rounded-xl border-[1.5px] border-dashed border-line bg-card/40 px-6 py-16 text-center', className)}
    >
      <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-brand-t text-brand [&_svg]:size-7">
        {icon}
      </div>
      <h3 className="mb-1.5 text-[19px] font-bold">{title}</h3>
      {children && <p className="mx-auto mb-5 max-w-[380px] text-ink2">{children}</p>}
      {action}
    </div>
  )
}
