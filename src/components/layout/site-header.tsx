'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Bell, Heart, LogOut, Menu, Settings, ShoppingBag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn } from '@/components/nk/btn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Brand } from './brand'

const NAV = [
  { href: '/ressources', label: 'Ressources' },
  { href: '/communautes', label: 'Communautés' },
  { href: '/formateurs', label: 'Formateurs' },
  { href: '/tarifs', label: 'Tarifs' },
]

function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.split('@')[0] || 'NK'
  const parts = source.split(/[\s.]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)
  return letters.toUpperCase()
}

export function SiteHeader() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)

  const user = status === 'authenticated' ? session?.user : null

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-[12px]">
        <div className="wrap flex h-[62px] items-center gap-4 md:h-[70px] md:gap-7">
          <Brand hideWordOnMobile />

          <nav className="hidden flex-1 items-center gap-1 lg:flex">
            {NAV.map(item => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-full px-3.5 py-2 text-[14.5px] font-semibold transition-colors',
                    active ? 'bg-navy text-paper' : 'text-ink2 hover:bg-white/65 hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            {status === 'loading' ? (
              <div className="h-[42px] w-32 animate-pulse rounded-full bg-line2" aria-hidden />
            ) : user ? (
              <>
                <Link
                  href="/notifications"
                  aria-label="Notifications"
                  className="relative grid size-[42px] place-items-center rounded-full border border-line bg-card text-ink2 transition hover:-translate-y-px hover:border-ink3 hover:text-ink"
                >
                  <Bell className="size-[19px]" />
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Compte"
                    className="size-[42px] rounded-full border-2 border-white bg-gradient-to-br from-brand to-info text-sm font-bold text-white shadow-sm transition hover:-translate-y-px"
                  >
                    {initialsOf(user.name, user.email)}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="flex flex-col gap-0.5">
                      <span className="font-bold">{user.name ?? 'Mon compte'}</span>
                      <span className="text-xs font-normal text-ink3">{user.email}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/mon-compte">
                        <Settings className="size-4" />
                        Mon compte
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/mes-achats">
                        <ShoppingBag className="size-4" />
                        Mes achats
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/favoris">
                        <Heart className="size-4" />
                        Favoris
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => signOut({ callbackUrl: '/' })}>
                      <LogOut className="size-4" />
                      Se déconnecter
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Link
                  href="/favoris"
                  aria-label="Favoris"
                  className="hidden size-[42px] place-items-center rounded-full border border-line bg-card text-ink2 transition hover:-translate-y-px hover:border-ink3 hover:text-ink sm:grid"
                >
                  <Heart className="size-[19px]" />
                </Link>
                <Btn asChild variant="tint" size="sm" className="hidden lg:inline-flex">
                  <Link href="/auth/connexion">Se connecter</Link>
                </Btn>
                <Btn asChild size="sm">
                  <Link href="/auth/inscription">S&apos;inscrire</Link>
                </Btn>
              </>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen(open => !open)}
              aria-expanded={mobileOpen}
              aria-label="Menu"
              className="grid size-[42px] place-items-center rounded-xl border border-line bg-card text-ink lg:hidden"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <nav className="fixed inset-x-0 top-[62px] z-40 border-b border-line bg-paper px-[18px] pb-[18px] pt-2.5 shadow-md lg:hidden">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="block border-b border-line2 px-1.5 py-3.5 text-base font-bold text-ink hover:text-brand"
            >
              {item.label}
            </Link>
          ))}
          {!user && (
            <div className="mt-4 flex gap-2.5">
              <Btn asChild variant="outline" className="flex-1">
                <Link href="/auth/connexion" onClick={() => setMobileOpen(false)}>
                  Se connecter
                </Link>
              </Btn>
              <Btn asChild className="flex-1">
                <Link href="/auth/inscription" onClick={() => setMobileOpen(false)}>
                  S&apos;inscrire
                </Link>
              </Btn>
            </div>
          )}
        </nav>
      )}
    </>
  )
}
