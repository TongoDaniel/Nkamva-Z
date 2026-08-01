'use client'

import { useState } from 'react'
import { FileText, PlayCircle, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CurriculumModule } from '@/features/demo/catalog-data'

/** Programme d'une ressource : accordéon module par module, premier module ouvert. */
export function Curriculum({ modules, isVideo }: { modules: CurriculumModule[]; isVideo: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const Icon = isVideo ? PlayCircle : FileText

  return (
    <div>
      {modules.map((module, i) => {
        const open = openIndex === i
        return (
          <div
            key={module.title}
            className={cn(
              'mb-2.5 overflow-hidden rounded-lg border bg-card transition-colors',
              open ? 'border-brand-t2' : 'border-line',
            )}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-sans text-[15px] font-bold text-ink hover:text-brand"
            >
              {module.title}
              <span className="flex flex-none items-center gap-3 text-[13px] font-semibold text-ink3">
                {module.lessons} leçons
                <span
                  className={cn(
                    'grid size-7 place-items-center rounded-full transition-[transform,background-color] duration-300',
                    open ? 'rotate-45 bg-brand-t text-brand' : 'bg-line2 text-ink2',
                  )}
                >
                  <Plus className="size-3.5" />
                </span>
              </span>
            </button>

            <div className={cn('grid transition-all duration-300', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
              <div className="overflow-hidden">
                <div className="border-t border-line2 px-5 py-2">
                  {Array.from({ length: module.lessons }, (_, j) => (
                    <div
                      key={j}
                      className="flex items-center gap-2.5 border-b border-line2 py-2.5 text-[13.5px] text-ink2 last:border-0"
                    >
                      <Icon className="size-4 flex-none text-ink3" />
                      Leçon {j + 1} — {module.title.split(',')[0].toLowerCase()}
                      <span className="ml-auto text-xs text-ink3">
                        {isVideo ? `${6 + ((i * 3 + j) % 9)} min` : `${2 + ((i + j) % 4)} pages`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
