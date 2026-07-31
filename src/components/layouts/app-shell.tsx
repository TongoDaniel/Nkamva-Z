"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Menu, Settings, ShoppingBag, User, X, Library } from "lucide-react";
import { Logo } from "@/components/nk/logo";
import { Avatar } from "@/components/nk/avatar";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/accueil", label: "Accueil" },
  { href: "/ressources", label: "Catalogue" },
  { href: "/mes-ressources", label: "Mes ressources" },
  { href: "/mes-achats", label: "Mes achats" },
];

const ACCOUNT_LINKS = [
  { href: "/mes-ressources", label: "Mes ressources", icon: Library },
  { href: "/mes-achats", label: "Mes achats", icon: ShoppingBag },
  { href: "/profil", label: "Profil et paramètres", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AccountMenu() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";
  const name = session?.user?.name || email.split("@")[0] || "Mon compte";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Menu du compte"
          className="group relative flex cursor-pointer items-center gap-1.5 rounded-full"
        >
          <Avatar name={name} ring />
          <ChevronDown
            className="size-4 text-ink-2 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={12}
          className={cn(
            "z-90 w-[280px] rounded-nk-lg border border-line bg-card p-2.5 shadow-nk-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="mb-1.5 border-b border-line-2 px-3 pb-3.5 pt-3">
            <b className="block font-display text-[14.5px]">{name}</b>
            <small className="block truncate text-[12.5px] text-ink-3">{email}</small>
          </div>
          {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
            <DropdownMenu.Item key={href} asChild>
              <Link
                href={href}
                className="flex cursor-pointer items-center gap-3 rounded-nk-sm px-3 py-2.5 text-sm font-semibold text-ink-2 outline-none hover:bg-paper hover:text-ink data-highlighted:bg-paper data-highlighted:text-ink"
              >
                <Icon className="size-[17px] text-ink-3" aria-hidden="true" />
                {label}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1.5 h-px bg-line-2" />
          <DropdownMenu.Item asChild>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex w-full cursor-pointer items-center gap-3 rounded-nk-sm px-3 py-2.5 text-left text-sm font-semibold text-danger outline-none hover:bg-danger-tint data-highlighted:bg-danger-tint"
            >
              <LogOut className="size-[17px]" aria-hidden="true" />
              Se déconnecter
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Coquille de l'espace connecté : topbar applicative + pied de page compact. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = React.useState(false);
  const { data: session, status } = useSession();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenu" className="nk-skip rounded-full bg-ink px-4 py-2 font-semibold text-paper">
        Aller au contenu
      </a>

      <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="nk-wrap flex h-[62px] items-center gap-4 md:h-[70px] md:gap-7">
          <Logo href="/accueil" compact />

          <nav aria-label="Navigation de mon espace" className="hidden flex-1 gap-1 min-[820px]:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-2 text-[14.5px] font-semibold transition duration-150",
                  isActive(pathname, item.href)
                    ? "bg-ink text-paper"
                    : "text-ink-2 hover:bg-white/70 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            {status === "loading" ? (
              <span className="size-[42px] animate-pulse rounded-full bg-line-2" aria-hidden="true" />
            ) : session?.user ? (
              <AccountMenu />
            ) : (
              <Link href="/auth/connexion" className="text-sm font-semibold text-brand">
                Se connecter
              </Link>
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="nk-app-nav"
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
              className="grid size-[42px] cursor-pointer place-items-center rounded-xl border border-line bg-card text-ink min-[820px]:hidden"
            >
              {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <nav
          id="nk-app-nav"
          aria-label="Navigation de mon espace (mobile)"
          hidden={!open}
          className="absolute inset-x-0 top-full z-[120] border-b border-line bg-paper px-4.5 pb-4.5 pt-2.5 shadow-nk min-[820px]:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className="block border-b border-line-2 px-1.5 py-3.5 text-base font-bold text-ink hover:text-brand"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="contenu" className="relative z-1 flex-1">
        {children}
      </main>

      <footer className="mt-[72px] border-t border-line bg-card">
        <div className="nk-wrap flex flex-wrap items-center gap-4.5 py-6.5">
          <Logo className="text-base" />
          <p className="text-[13px] text-ink-3">
            © {new Date().getFullYear()} NkamVa
          </p>
          <Link href="/aide" className="ml-auto text-[13px] font-semibold text-ink-2 hover:text-brand">
            Aide
          </Link>
        </div>
      </footer>
    </div>
  );
}
