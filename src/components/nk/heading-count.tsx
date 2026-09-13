import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Le nombre d'éléments d'une section, posé après son titre.
 *
 * **Sans fond.** C'était une `Chip tone="muted"` — une pastille beige autour du
 * chiffre —, retirée le 12 septembre 2026 à la demande du propriétaire. Posée à
 * côté d'un titre de 28 px en gras, la pastille faisait du chiffre un deuxième
 * titre, et un « 0 » en surbrillance attirait l'œil sur ce qui justement n'était
 * pas là. Le chiffre reste, en gris et plus petit : il renseigne sans réclamer.
 *
 * Un composant plutôt que la même poignée de classes recopiée : le motif vivait
 * à sept endroits, et c'est ainsi que la pastille avait gagné tous les écrans.
 *
 * 15 px fixes et non une fraction du titre : dans un `h3` de 15 px, `0.6em`
 * tomberait à 9 px, sous le plancher de 13 px de l'arbitrage 116.
 */
export function HeadingCount({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "ml-2 align-middle font-display text-[15px] font-semibold tabular-nums text-ink-3",
        className,
      )}
    >
      {fmtNumber(n)}
    </span>
  );
}
