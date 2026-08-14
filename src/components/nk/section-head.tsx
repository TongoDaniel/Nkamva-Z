import * as React from "react";
import { cn } from "@/lib/utils";

/** Sur-titre en petites capitales terracotta — port de `.kick`. */
export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "mb-3.5 font-sans text-[13px] font-bold uppercase tracking-[0.14em] text-clay-ink",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * En-tête de section — port de `.shead` / `.shead.mid`.
 * `emphasis` reprend le `<em>` bleu de la maquette : un fragment du titre passe
 * en couleur de marque sans devenir de l'italique.
 */
export function SectionHead({
  kicker,
  title,
  emphasis,
  after,
  lead,
  centered,
  id,
  className,
  headingLevel: Heading = "h2",
}: {
  kicker?: string;
  title: React.ReactNode;
  emphasis?: string;
  after?: string;
  lead?: React.ReactNode;
  centered?: boolean;
  id?: string;
  className?: string;
  headingLevel?: "h1" | "h2";
}) {
  return (
    <div className={cn("mb-9 max-w-[640px]", centered && "mx-auto text-center", className)}>
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      <Heading
        id={id}
        className="mb-2.5 text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.1] text-balance"
      >
        {title}
        {emphasis ? <em className="not-italic text-brand">{emphasis}</em> : null}
        {after}
      </Heading>
      {lead ? <p className="text-base leading-relaxed text-ink-2 text-pretty">{lead}</p> : null}
    </div>
  );
}
