import * as React from "react";
import Link from "next/link";
import { FileWarning } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";

const PAGES = [
  { href: "/legal/conditions", label: "Conditions d'utilisation" },
  { href: "/legal/confidentialite", label: "Confidentialité" },
  { href: "/legal/mentions", label: "Mentions légales" },
];

/**
 * Gabarit des pages légales.
 *
 * Le bandeau de relecture n'est pas décoratif : le contenu décrit fidèlement
 * le fonctionnement du produit, mais sa portée juridique n'a pas été validée.
 * Il doit disparaître par une décision explicite, après relecture, et non par
 * oubli.
 */
export function LegalPage({
  title,
  lead,
  updatedAt,
  children,
}: {
  title: string;
  lead?: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: title }]}
        title={title}
        lead={lead}
      />

      <nav aria-label="Documents légaux" className="mt-4">
        <ul className="flex flex-wrap gap-2">
          {PAGES.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="block rounded-full border border-line bg-card px-4 py-2 text-[13.5px] font-semibold text-ink-2 hover:border-ink-3 hover:text-ink"
              >
                {page.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mx-auto mt-6 flex max-w-[760px] items-start gap-3 rounded-nk border border-line bg-card border-l-4 border-l-gold px-5 py-4 text-[13.5px] leading-relaxed text-gold-ink rounded-l-sm">
        <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <b>Document en attente de relecture juridique.</b> Le contenu ci-dessous décrit
          fidèlement le fonctionnement de la plateforme, mais n&apos;a pas été validé par un
          conseil. Il ne doit pas être opposé aux utilisateurs en l&apos;état.
        </span>
      </p>

      <article className="mx-auto mt-8 max-w-[760px] [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:text-[20px] [&_h2]:font-extrabold [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-[16px] [&_h3]:font-bold [&_li]:mb-1.5 [&_p]:mb-3.5 [&_p]:text-[15px] [&_p]:leading-relaxed [&_p]:text-ink-2 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-[15px] [&_ul]:leading-relaxed [&_ul]:text-ink-2">
        {children}
      </article>

      <p className="mx-auto mt-7 max-w-[760px] border-t border-line-2 pt-5 sm:mt-10 text-[13px] text-ink-3">
        Dernière mise à jour : {updatedAt}. Pour toute question,{" "}
        <Link href="/contact" className="font-semibold text-brand">
          écrivez-nous
        </Link>
        .
      </p>
    </div>
  );
}

/** Information d'identité que seule l'entreprise peut fournir. */
export function ToProvide({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-line-2 px-1.5 py-0.5 font-mono text-[13px] text-ink-2">
      [à compléter : {children}]
    </span>
  );
}
