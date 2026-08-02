import * as React from "react";
import Image from "next/image";
import Link from "next/link";
// `ImageIcon` est importé sous son nom d'export : `Image as ImageIcon` est
// réécrit par l'optimisation d'imports de Next et entre alors en collision
// avec le `Image` de `next/image` — le composant devient indéfini au rendu.
import { ArrowLeft, ImageIcon } from "lucide-react";
import { Logo } from "@/components/nk/logo";
import { cn } from "@/lib/utils";

/**
 * Coquille des pages d'authentification — port de `.authpage` / `.authL` / `.authR`.
 * Le panneau de droite est purement décoratif : masqué sous 920px et retiré de
 * l'arbre d'accessibilité pour ne pas polluer la lecture du formulaire.
 */
export function AuthShell({
  children,
  aside,
  className,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("grid min-h-screen bg-paper lg:grid-cols-2", className)}>
      <div className="relative flex flex-col justify-center px-6 py-10 lg:px-16 lg:py-14">
        <Logo className="mb-6 lg:absolute lg:left-16 lg:top-10 lg:mb-0" />
        <div className="mx-auto w-full max-w-[400px]">{children}</div>
      </div>
      <div
        aria-hidden="true"
        className="relative m-3.5 ml-0 hidden overflow-hidden rounded-[22px] bg-line-2 lg:block"
      >
        {aside}
      </div>
    </main>
  );
}

/**
 * Contenu du panneau latéral : visuel + citation, port de `.authR`.
 *
 * La maquette réserve ici un emplacement photo (`image-slot`) sans fournir le
 * fichier. Tant que la photo n'existe pas, on affiche l'emplacement et sa
 * consigne de cadrage plutôt qu'un aplat décoratif : le manque reste visible.
 * Dès que la photo est fournie, passer `photo` et le repère disparaît.
 */
export function AuthAside({
  photo,
  photoBrief,
  quote,
  author,
}: {
  /** Chemin d'une image dans `public/`. */
  photo?: string;
  /** Description du visuel attendu, affichée tant que `photo` est absent. */
  photoBrief: string;
  quote: string;
  author: string;
}) {
  return (
    <>
      {photo ? (
        <Image src={photo} alt="" fill sizes="50vw" className="object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center px-10 text-center">
          <div>
            <ImageIcon className="mx-auto mb-3 size-7 text-ink-3" />
            <p className="text-[14.5px] text-ink-2">Photo — {photoBrief}</p>
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-8 text-white">
        <p className="mb-2 max-w-[420px] font-display text-[19px] font-bold leading-tight">
          « {quote} »
        </p>
        <span className="text-[13px] text-[#dfe7e2]">{author}</span>
      </div>
    </>
  );
}

/** Titre + sous-titre d'un formulaire d'authentification. */
export function AuthHeading({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <>
      {icon ? (
        <div
          className="mb-4.5 grid size-13 place-items-center rounded-[14px] bg-brand-tint text-brand [&_svg]:size-6"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <h1 className="mb-2 mt-11 text-[27px] font-extrabold first:mt-0">{title}</h1>
      {subtitle ? <p className="mb-7 text-[15px] leading-relaxed text-ink-2">{subtitle}</p> : null}
    </>
  );
}

/** Lien de retour discret sous un formulaire (`.abackline`). */
export function AuthBackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="text-center">
      <Link
        href={href}
        className="mt-4.5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="size-[15px]" aria-hidden="true" />
        {children}
      </Link>
    </div>
  );
}

/** Bandeau d'erreur de formulaire, annoncé aux lecteurs d'écran. */
export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="mb-4 rounded-xl border border-danger/30 bg-danger-tint px-4 py-3 text-[13.5px] font-semibold text-danger"
    >
      {children}
    </p>
  );
}

/** Bandeau de confirmation. */
export function FormNotice({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="status"
      className="mb-4 rounded-xl bg-brand-tint px-4 py-3 text-[13.5px] font-semibold text-brand-dark"
    >
      {children}
    </p>
  );
}
