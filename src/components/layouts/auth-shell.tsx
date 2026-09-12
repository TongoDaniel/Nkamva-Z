import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/nk/logo";
import { cn } from "@/lib/utils";

/**
 * Coquille des pages d'authentification — même mise en page que
 * `/devenir-formateur` : fond `paper`, logo centré, puis une carte unique qui
 * porte le formulaire.
 *
 * La carte reprend exactement les classes de `WizardCard` (`.wizcard`) plutôt
 * que de les redéclarer à sa façon : les deux parcours se croisent (on passe de
 * `/auth/inscription` à `/devenir-formateur` par le lien « Postulez pour
 * enseigner »), un écart de rayon ou d'ombre s'y verrait immédiatement.
 *
 * `max-w-[480px]` et non les 560px du wizard : une fois les 2×40px de
 * rembourrage retirés, le formulaire retrouve les 400px de large qu'il avait
 * dans l'ancienne coquille en deux colonnes. Le wizard, lui, a besoin de plus
 * pour sa ligne « mot de passe + confirmation ».
 */
export function AuthShell({
  children,
  illustration,
  className,
}: {
  children: React.ReactNode;
  /** Visuel accolé au formulaire — cf. `AuthIllustration`. */
  illustration?: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("min-h-dvh bg-background px-5 pb-[70px] pt-8 sm:pt-14", className)}>
      {/* La carte ne s'élargit qu'au moment où elle se scinde. Sans le palier
          `lg:`, un écran de 900px la garderait sur une colonne mais à 780px de
          large : un formulaire de connexion étiré sur 700px. */}
      <div
        className={cn("mx-auto w-full max-w-[480px]", illustration && "lg:max-w-[780px]")}
      >
        <div className="mb-[26px] flex justify-center">
          <Logo />
        </div>
        {/* `overflow-hidden` : la photo touche les bords, c'est le conteneur qui
            lui découpe ses coins. Le rembourrage descend sur le bloc du
            formulaire pour que la photo n'en hérite pas.

            La scission attend `lg` (1024px), pas `md`. Entre les deux, les 300px
            de la colonne photo se prendraient sur le formulaire, qui tomberait
            sous 350px de contenu — plus étroit que sur un téléphone. */}
        <div className="flex flex-col overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk-sm lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* `order` : empilée, la photo passe au-dessus du formulaire ; scindée,
              l'ordre du DOM reprend la main et la remet à droite. Le formulaire
              reste premier dans le DOM — c'est lui qu'on vient remplir. */}
          <div className="order-2 p-6 sm:px-10 sm:py-9 lg:order-none">{children}</div>
          {illustration}
        </div>
      </div>
    </main>
  );
}

/**
 * Photo + citation accolée au formulaire — ce que portait le panneau latéral de
 * l'ancienne coquille en deux colonnes, ramené à l'intérieur de la carte.
 *
 * Le cadre change avec la mise en page, et le cadrage doit suivre. Les six
 * fichiers sont des portraits verticaux (1024×1536) dont le sujet occupe le haut :
 *   - colonne (`lg`) — 300px de large sur toute la hauteur de la carte, presque
 *     le format natif : `object-top`, comme l'ancien panneau ;
 *   - bandeau (en dessous) — large et court, où viser le haut du portrait coupe
 *     au menton : `object-[50%_35%]`.
 *
 * Le visuel est décoratif : `aria-hidden` et `alt=""`. La citation est un
 * argument commercial, pas une consigne — un lecteur d'écran qui la lit avant le
 * formulaire fait perdre du temps à qui vient juste se connecter.
 *
 * `priority` — l'ancien panneau était masqué sous 1024px, le précharger aurait
 * fait payer ~100 Ko à des mobiles qui ne l'auraient jamais vu. Celui-ci est
 * visible à **toutes** les largeurs et occupe le haut de la carte tant qu'elle
 * n'est pas scindée : c'est l'image LCP, la différer la retarde pour tout le monde.
 */
export function AuthIllustration({
  photo,
  quote,
  author,
  focus,
}: {
  /** Chemin d'une image dans `public/`. */
  photo: string;
  quote: string;
  author: string;
  /**
   * Hauteur visée dans la source par le cadrage en bandeau, en pourcentage.
   *
   * Il n'y a pas de valeur qui convienne aux six photos : ce sont des portraits
   * verticaux dont le sujet est place differemment d'un fichier a l'autre, et le
   * bandeau n'en montre qu'une tranche de 24% de la hauteur. Une valeur unique
   * decapite les uns ou coupe le menton des autres — le premier jet, fige a 35%,
   * ne montrait qu'un torse sur trois des six pages.
   *
   * Chaque valeur est relevee sur le rognage reel, pas estimee. Pour la reprendre
   * apres un changement de photo : extraire la tranche que le bandeau conserve et
   * la regarder, un calcul de zone sure ne suffit pas.
   */
  focus: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative order-1 h-[150px] w-full bg-line-2 sm:h-[172px] lg:order-none lg:h-full"
    >
      <Image
        src={photo}
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 300px, (min-width: 520px) 480px, calc(100vw - 40px)"
        // La valeur passe par une variable CSS : une classe Tailwind construite à
        // l'exécution ne serait pas générée. En colonne, `lg:object-top` reprend
        // la main — le cadre y est presque au format natif, aucun réglage requis.
        style={{ "--nk-focus": focus } as React.CSSProperties}
        className="object-cover object-[50%_var(--nk-focus)] lg:object-top"
      />
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/35 to-transparent px-6 pb-4 pt-10 text-white sm:px-8 lg:px-6 lg:pb-6">
        {/* Espaces insécables autour des guillemets : dans une colonne de 300px,
            une citation tient sur trois lignes et le `»` finissait seul sur la
            dernière. `text-pretty` évite en plus le mot orphelin. */}
        <p className="mb-1 text-pretty font-display text-[15.5px] font-bold leading-snug">
          {"« "}
          {quote}
          {" »"}
        </p>
        <span className="text-[13px] text-[#dfe7e2]">{author}</span>
      </div>
    </div>
  );
}

/**
 * Titre + sous-titre d'un formulaire d'authentification.
 *
 * Centré et calé sur la typographie de `WizardCard` (23px / 14.5px) : dans une
 * carte, un titre aligné à gauche rompt l'axe que tient le reste de la page
 * (logo, bouton pleine largeur, lien de retour).
 */
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
          className="mx-auto mb-5 grid size-13 place-items-center rounded-[14px] bg-brand-tint text-brand [&_svg]:size-6"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <h1 className="mb-1.5 text-center text-[23px] font-bold">{title}</h1>
      {subtitle ? (
        <p className="mb-6 text-center text-[14.5px] leading-relaxed text-ink-2">{subtitle}</p>
      ) : null}
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
