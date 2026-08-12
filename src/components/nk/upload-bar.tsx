import { cn } from "@/lib/utils";
import { fmtBytes } from "@/lib/format";
import type { UploadProgress } from "@/lib/upload";

/**
 * Avancement d'un téléversement.
 *
 * Deux régimes, et la distinction compte : tant que le fichier monte, la barre
 * est *déterminée* et dit où l'on en est ; une fois le dernier octet parti, le
 * serveur relit l'objet et vérifie son contenu, ce qui prend un temps qu'on ne
 * sait pas prédire — la barre devient alors indéterminée plutôt que de rester
 * bloquée à 100 % en laissant croire que rien n'avance.
 *
 * `aria-valuenow` n'est posé que dans le premier cas : une barre ARIA sans
 * valeur est précisément la façon d'annoncer un avancement inconnu.
 */
export function UploadBar({
  progress,
  label,
  className,
}: {
  /** `null` pendant les phases dont la durée est inconnue. */
  progress: UploadProgress | null;
  /** Ce qui se passe, en toutes lettres. */
  label: string;
  className?: string;
}) {
  const ratio = progress?.ratio ?? null;
  const percent = ratio === null ? null : Math.round(ratio * 100);

  return (
    <div className={cn("mt-3", className)}>
      <p className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px] text-ink-2">
        <span className="font-semibold">{label}</span>
        {progress && progress.total > 0 ? (
          <span className="tabular-nums text-ink-3">
            {fmtBytes(progress.loaded)} sur {fmtBytes(progress.total)}
            {percent !== null ? ` · ${percent} %` : ""}
          </span>
        ) : null}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(percent !== null ? { "aria-valuenow": percent } : {})}
        className="h-1.5 w-full overflow-hidden rounded-full bg-line-2"
      >
        {percent !== null ? (
          <i
            className="block h-full rounded-full bg-brand transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        ) : (
          // Indéterminé : un segment qui va et vient, comme le trait de NavLink.
          <i
            className="block h-full w-1/4 rounded-full bg-brand"
            style={{ animation: "nk-nav 1.1s ease-in-out infinite" }}
          />
        )}
      </div>
    </div>
  );
}
