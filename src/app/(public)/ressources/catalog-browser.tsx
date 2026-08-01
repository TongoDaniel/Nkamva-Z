'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/nk/btn'
import { EmptyState } from '@/components/nk/empty-state'
import { ResourceCard } from '@/components/nk/resource-card'
import {
  CATEGORIES,
  FORMATS,
  RESOURCES,
  type CategoryId,
  type FormatId,
} from '@/features/demo/catalog-data'

const PAGE_SIZE = 9

type SortKey = 'pop' | 'new' | 'price-a' | 'price-d'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'pop', label: 'Les plus populaires' },
  { value: 'new', label: 'Les plus récentes' },
  { value: 'price-a', label: 'Prix croissant' },
  { value: 'price-d', label: 'Prix décroissant' },
]

/** Case à cocher carrée du panneau de filtres (`.fopt`). */
function FilterOption({
  label,
  count,
  checked,
  onChange,
}: {
  label: string
  count: number
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-[7px] text-sm font-medium text-ink2 hover:text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          'grid size-[19px] flex-none place-items-center rounded-md border-[1.5px] transition',
          checked ? 'border-brand bg-brand text-white' : 'border-line bg-card text-transparent',
        )}
      >
        <Check className="size-3" strokeWidth={3.4} />
      </span>
      {label}
      <span className="ml-auto text-xs font-semibold text-ink3">{count}</span>
    </label>
  )
}

export function CatalogBrowser() {
  const [query, setQuery] = useState('')
  const [cats, setCats] = useState<Set<CategoryId>>(new Set())
  const [fmts, setFmts] = useState<Set<FormatId>>(new Set())
  const [sort, setSort] = useState<SortKey>('pop')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = RESOURCES.filter(r => {
      if (q && !`${r.title} ${r.author.name} ${r.category.label}`.toLowerCase().includes(q)) return false
      if (cats.size && !cats.has(r.category.id)) return false
      if (fmts.size && !fmts.has(r.format.id)) return false
      return true
    })

    return [...filtered].sort((a, b) => {
      if (sort === 'price-a') return a.price - b.price
      if (sort === 'price-d') return b.price - a.price
      if (sort === 'new') return b.updated.localeCompare(a.updated)
      return b.students - a.students
    })
  }, [query, cats, fmts, sort])

  function toggle<T>(set: Set<T>, value: T, apply: (next: Set<T>) => void) {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
    setShown(PAGE_SIZE)
  }

  function clearAll() {
    setCats(new Set())
    setFmts(new Set())
    setQuery('')
    setShown(PAGE_SIZE)
  }

  const activePills = [
    ...[...cats].map(id => ({
      key: `cat-${id}`,
      label: CATEGORIES.find(c => c.id === id)!.label,
      remove: () => toggle(cats, id, setCats),
    })),
    ...[...fmts].map(id => ({
      key: `fmt-${id}`,
      label: FORMATS.find(f => f.id === id)!.label,
      remove: () => toggle(fmts, id, setFmts),
    })),
    ...(query.trim() ? [{ key: 'q', label: `« ${query.trim()} »`, remove: () => setQuery('') }] : []),
  ]

  const filters = (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold">Filtrer</h3>
        <button type="button" onClick={clearAll} className="text-[13px] font-semibold text-brand hover:underline">
          Réinitialiser
        </button>
      </div>

      <div className="mb-5">
        <h4 className="mb-1.5 font-sans text-xs font-bold uppercase tracking-[0.12em] text-ink3">Catégorie</h4>
        {CATEGORIES.map(category => (
          <FilterOption
            key={category.id}
            label={category.label}
            count={RESOURCES.filter(r => r.category.id === category.id).length}
            checked={cats.has(category.id)}
            onChange={() => toggle(cats, category.id, setCats)}
          />
        ))}
      </div>

      <div>
        <h4 className="mb-1.5 font-sans text-xs font-bold uppercase tracking-[0.12em] text-ink3">Format</h4>
        {FORMATS.map(format => (
          <FilterOption
            key={format.id}
            label={format.label}
            count={RESOURCES.filter(r => r.format.id === format.id).length}
            checked={fmts.has(format.id)}
            onChange={() => toggle(fmts, format.id, setFmts)}
          />
        ))}
      </div>
    </>
  )

  return (
    <div className="grid items-start gap-8 pt-[26px] lg:grid-cols-[262px_1fr]">
      <aside aria-label="Filtres" className="hidden rounded-xl border border-line bg-card p-5 lg:block">
        {filters}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-[110] lg:hidden">
          <button
            type="button"
            aria-label="Fermer les filtres"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/45"
          />
          <div className="absolute inset-y-0 left-0 w-[300px] max-w-[85vw] overflow-y-auto bg-card p-5 shadow-lg">
            {filters}
            <Btn variant="dark" className="mt-5 w-full" onClick={() => setDrawerOpen(false)}>
              Voir les résultats
            </Btn>
          </div>
        </div>
      )}

      <section>
        <div className="mb-5 flex flex-wrap items-center gap-3.5">
          <Btn variant="outline" size="sm" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
            <SlidersHorizontal />
            Filtres
          </Btn>

          <label className="flex h-12 min-w-[230px] flex-1 items-center gap-2.5 rounded-full border-[1.5px] border-line bg-card px-[18px] transition focus-within:border-brand">
            <Search className="size-[18px] flex-none text-ink3" />
            <input
              type="search"
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                setShown(PAGE_SIZE)
              }}
              placeholder="Rechercher une ressource, un formateur…"
              autoComplete="off"
              className="min-w-0 flex-1 border-none bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink3"
            />
          </label>

          <span className="whitespace-nowrap text-sm font-semibold text-ink2">
            <b className="font-extrabold text-ink">{results.length}</b> ressource{results.length > 1 ? 's' : ''}
          </span>

          <div className="relative">
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              aria-label="Trier"
              className="h-12 cursor-pointer appearance-none rounded-full border-[1.5px] border-line bg-card pl-[18px] pr-10 text-sm font-semibold text-ink transition hover:border-ink3"
            >
              {SORTS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-ink3" />
          </div>
        </div>

        {activePills.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {activePills.map(pill => (
              <span
                key={pill.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-1.5 pl-3.5 pr-2 text-[13px] font-semibold text-ink2"
              >
                {pill.label}
                <button type="button" onClick={pill.remove} aria-label={`Retirer ${pill.label}`} className="text-ink3 hover:text-ink">
                  <X className="size-3.5" strokeWidth={2.6} />
                </button>
              </span>
            ))}
            <button type="button" onClick={clearAll} className="text-[13px] font-semibold text-brand hover:underline">
              Tout effacer
            </button>
          </div>
        )}

        {results.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="Aucune ressource trouvée"
            action={
              <Btn variant="outline" onClick={clearAll}>
                Réinitialiser les filtres
              </Btn>
            }
          >
            Essayez d&apos;élargir votre recherche ou de retirer un filtre.
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-3">
              {results.slice(0, shown).map((resource, index) => (
                <ResourceCard key={resource.slug} resource={resource} index={index} />
              ))}
            </div>

            {results.length > shown && (
              <div className="mt-8 flex justify-center">
                <Btn variant="outline" size="lg" onClick={() => setShown(n => n + PAGE_SIZE)}>
                  Afficher plus ({results.length - shown})
                </Btn>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
