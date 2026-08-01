'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FaqItem {
  question: string
  answer: React.ReactNode
}

/** Accordéon de questions fréquentes (`.faq` / `.qa`). */
export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className={cn('mx-auto max-w-[780px]', className)}>
      {items.map((item, index) => {
        const open = openIndex === index
        return (
          <div
            key={item.question}
            className={cn(
              'mb-3 overflow-hidden rounded-lg border bg-card transition-colors',
              open ? 'border-brand-t2' : 'border-line',
            )}
          >
            <h3>
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : index)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-4 px-[22px] py-[19px] text-left font-sans text-base font-bold text-ink hover:text-brand"
              >
                {item.question}
                <span
                  className={cn(
                    'grid size-[30px] flex-none place-items-center rounded-full transition-[transform,background-color] duration-300',
                    open ? 'rotate-45 bg-brand-t text-brand' : 'bg-line2 text-ink2',
                  )}
                >
                  <Plus className="size-[15px]" />
                </span>
              </button>
            </h3>
            <div className={cn('grid transition-all duration-300', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
              <div className="overflow-hidden">
                <div className="space-y-2 px-[22px] pb-5 text-[14.5px] leading-[1.65] text-ink2">{item.answer}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
