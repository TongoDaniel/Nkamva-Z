import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: string;
  label: string;
}

/**
 * Fil d'étapes — port de `.steps` / `.step`.
 * L'état courant est annoncé via `aria-current="step"` et la progression
 * globale est reprise en clair pour ne pas dépendre de la couleur.
 */
export function WizardSteps({
  steps,
  current,
  label = "Progression",
  className,
}: {
  steps: WizardStep[];
  /** Index de l'étape en cours, à partir de 0. */
  current: number;
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("mb-7", className)}>
      <p className="sr-only" aria-live="polite">
        Étape {current + 1} sur {steps.length} : {steps[current]?.label}
      </p>
      <ol className="flex items-center justify-center">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.id} className="flex items-center">
              {i > 0 ? <span className="mx-2.5 h-[1.5px] w-6 bg-line sm:w-14" aria-hidden="true" /> : null}
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 text-[13.5px] font-bold",
                  active && "text-brand",
                  done && "text-brand-dark",
                  !active && !done && "text-ink-3",
                )}
              >
                <span
                  className={cn(
                    "grid size-[26px] place-items-center rounded-full text-[12.5px]",
                    active && "bg-brand text-white",
                    done && "bg-brand-dark text-white",
                    !active && !done && "bg-line-2 text-ink-3",
                  )}
                  aria-hidden="true"
                >
                  {done ? <Check className="size-[13px]" /> : i + 1}
                </span>
                <span className="sr-only sm:not-sr-only">{step.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Carte contenant l'étape courante (`.wizcard`). */
export function WizardCard({
  title,
  titleAs: Title = "h2",
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  /**
   * Niveau du titre de la carte.
   *
   * `h2` par défaut : sur `/candidature`, la carte est précédée d'un
   * `PageHead` qui porte déjà le `h1` de la page. Mais `/devenir-formateur`
   * est une page autonome, sans en-tête ni topbar — la carte y est le seul
   * titre, et un document qui commence à `h2` laisse les lecteurs d'écran
   * sans point d'entrée. Ces pages passent donc `titleAs="h1"`.
   */
  titleAs?: "h1" | "h2";
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:px-10 sm:py-9",
        className,
      )}
    >
      <Title className="mb-1.5 text-center text-[23px] font-bold">{title}</Title>
      {subtitle ? (
        <p className="mb-6 text-center text-[14.5px] text-ink-2">{subtitle}</p>
      ) : null}
      {children}
      {footer ? <div className="mt-2 flex items-center justify-between">{footer}</div> : null}
    </div>
  );
}
