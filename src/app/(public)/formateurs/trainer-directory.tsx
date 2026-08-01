'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/nk/btn'
import { EmptyState } from '@/components/nk/empty-state'
import { CATEGORIES } from '@/features/demo/catalog-data'
import { TRAINERS } from '@/features/demo/community-data'

const TABS = [{ id: 'all', label: 'Tous' }, ...CATEGORIES.map(c => ({ id: c.id, label: c.label }))]

export function TrainerDirectory() {
  const [tab, setTab] = useState<string>('all')
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TRAINERS.filter(trainer => {
      if (tab !== 'all' && trainer.category.id !== tab) return false
      if (q && !`${trainer.name} ${trainer.role}`.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => b.students - a.students)
  }, [tab, query])

  return (
    <div className="pt-6">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex gap-1.5 overflow-x-auto border-b-[1.5px] border-line">
          {TABS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'relative whitespace-nowrap px-4 py-3 font-sans text-[15px] font-semibold transition-colors',
                tab === item.id
                  ? 'text-ink after:absolute after:inset-x-3 after:-bottom-[1.5px] after:h-[3px] after:rounded-[3px] after:bg-brand'
                  : 'text-ink3 hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="ml-auto flex h-12 min-w-[230px] flex-1 items-center gap-2.5 rounded-full border-[1.5px] border-line bg-card px-[18px] transition focus-within:border-brand">
          <Search className="size-[18px] flex-none text-ink3" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un formateur…"
            className="min-w-0 flex-1 border-none bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink3"
          />
        </label>

        <span className="whitespace-nowrap text-sm font-semibold text-ink2">
          <b className="font-extrabold text-ink">{results.length}</b> formateur{results.length > 1 ? 's' : ''}
        </span>
      </div>

      {results.length === 0 ? (
        <EmptyState icon={<Search />} title="Aucun formateur trouvé">
          Essayez une autre catégorie ou un autre terme de recherche.
        </EmptyState>
      ) : (
        <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((trainer, index) => (
            <article
              key={trainer.id}
              className="nk-reveal relative flex flex-col items-center rounded-xl border border-line bg-card p-6 text-center shadow-sm transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-md"
              style={{ '--i': index % 8 } as React.CSSProperties}
            >
              <span className="grid size-[62px] place-items-center rounded-2xl bg-gradient-to-br from-brand to-info font-display text-lg font-extrabold text-white">
                {trainer.initials}
              </span>
              <h3 className="mt-3 text-[17px] font-bold">
                <Link href={`/formateurs/${trainer.id}`} className="text-ink after:absolute after:inset-0 hover:text-brand">
                  {trainer.name}
                </Link>
              </h3>
              <p className="mt-0.5 text-[13.5px] text-ink2">{trainer.role}</p>
              <div className="mt-3 flex gap-4 text-[13px] text-ink2">
                <span>
                  <b className="font-bold text-ink">{trainer.resourceCount}</b> ressource
                  {trainer.resourceCount > 1 ? 's' : ''}
                </span>
                <span>
                  <b className="font-bold text-ink">{trainer.students.toLocaleString('fr-FR')}</b> apprenants
                </span>
              </div>
              <Btn variant="outline" size="sm" className="pointer-events-none mt-4">
                Voir le profil
              </Btn>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
