"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Champ pilule avec icône — port de `.input` (recherche, barres d'outils) */
/* ------------------------------------------------------------------ */

export interface PillInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  /** Libellé accessible quand aucun <label> visible n'accompagne le champ. */
  "aria-label"?: string;
  wrapperClassName?: string;
}

export const PillInput = React.forwardRef<HTMLInputElement, PillInputProps>(
  function PillInput({ icon, className, wrapperClassName, ...props }, ref) {
    return (
      <div
        className={cn(
          "flex h-12 items-center gap-2.5 rounded-full border-[1.5px] border-line bg-card px-4 transition duration-150",
          "focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/25",
          wrapperClassName,
        )}
      >
        {icon ? (
          <span className="shrink-0 text-ink-3 [&_svg]:size-[18px]" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          className={cn(
            // 16 px sous `md` : en deçà, iOS zoome le viewport à la mise au point.
            "min-w-0 flex-1 border-0 bg-transparent text-base font-medium text-ink outline-none md:text-[15px]",
            "placeholder:text-ink-3",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);

/* ------------------------------------------------------------------ */
/* Champ de formulaire étiqueté — port de `.afield`                     */
/* ------------------------------------------------------------------ */

export interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  id?: string;
  containerClassName?: string;
  /**
   * Le ⓘ posé à côté du libellé — un `<Hint>` déjà formé, passé par l'appelant
   * (arbitrage 138). Il porte la **règle** que le champ applique : ce que
   * devient un nouveau prix, où s'affiche ce qu'on écrit. `hint`, lui, reste
   * pour ce qui doit se lire sans clic — une contrainte de saisie, un tarif, un
   * avertissement. Les deux peuvent coexister.
   */
  labelHint?: React.ReactNode;
}

/**
 * Touche d'action du clavier mobile — règle 5 des onze règles d'expérience.
 *
 * Le clavier affichait « Entrée » sur les 55 champs du produit : `enterKeyHint`
 * n'était utilisé **nulle part**. Sur un formulaire long — candidature, moyen de
 * paiement, création de ressource —, savoir si la touche enchaîne ou valide
 * change la façon dont on le remplit.
 *
 * Le défaut est « suivant », parce qu'un champ appartient presque toujours à une
 * suite ; le dernier champ d'un formulaire passe `enterKeyHint="go"` ou `"send"`
 * à la main. Une recherche est reconnue à son type.
 */
function defaultEnterKeyHint(
  type: React.HTMLInputTypeAttribute | undefined,
): React.HTMLAttributes<HTMLInputElement>["enterKeyHint"] | undefined {
  if (type === "search") return "search";
  // Les champs qui n'ouvrent pas de clavier textuel n'ont rien à annoncer.
  if (type && ["checkbox", "radio", "range", "color", "file", "date", "time"].includes(type)) {
    return undefined;
  }
  return "next";
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, labelHint, hint, error, id, className, containerClassName, enterKeyHint, ...props },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("mb-[18px]", containerClassName)}>
      <div className="mb-1.5 flex items-center gap-1">
        <label htmlFor={inputId} className="block text-[13.5px] font-bold text-ink">
          {label}
        </label>
        {labelHint}
      </div>
      <input
        ref={ref}
        id={inputId}
        enterKeyHint={enterKeyHint ?? defaultEnterKeyHint(props.type)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-[13px] text-base font-medium text-ink md:text-[15px]",
          "outline-none transition duration-150 placeholder:text-ink-3",
          "focus:border-brand focus:ring-[3px] focus:ring-brand/25",
          error && "border-danger focus:border-danger focus:ring-danger/25",
          className,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Mot de passe : bascule d'affichage + jauge de robustesse             */
/* ------------------------------------------------------------------ */

export function passwordStrength(value: string): 0 | 1 | 2 | 3 {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score++;
  return Math.min(3, score) as 0 | 1 | 2 | 3;
}

const STRENGTH_LABEL = ["Trop court", "Faible", "Moyen", "Robuste"] as const;

export interface PasswordFieldProps extends Omit<FieldProps, "type"> {
  /** Affiche la jauge à trois segments de la maquette. */
  showStrength?: boolean;
  value?: string;
}

export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, hint, error, id, showStrength, value, className, containerClassName, ...props }, ref) {
    const [visible, setVisible] = React.useState(false);
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;
    const strengthId = `${inputId}-strength`;
    const score = passwordStrength(String(value ?? ""));
    const describedBy = [
      showStrength ? strengthId : null,
      hint ? hintId : null,
      error ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={cn("mb-[18px]", containerClassName)}>
        <label htmlFor={inputId} className="mb-1.5 block text-[13.5px] font-bold text-ink">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            className={cn(
              "w-full rounded-xl border-[1.5px] border-line bg-card py-[13px] pl-3.5 pr-11 text-base font-medium text-ink md:text-[15px]",
              "outline-none transition duration-150 placeholder:text-ink-3",
              "focus:border-brand focus:ring-[3px] focus:ring-brand/25",
              error && "border-danger focus:border-danger focus:ring-danger/25",
              className,
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={visible}
            className="nk-tap absolute inset-y-1 right-1 grid w-[38px] cursor-pointer place-items-center rounded-lg text-ink-3 hover:text-ink"
          >
            {visible ? (
              <EyeOff className="size-[19px]" aria-hidden="true" />
            ) : (
              <Eye className="size-[19px]" aria-hidden="true" />
            )}
          </button>
        </div>
        {showStrength ? (
          <>
            <div className="my-2 flex gap-1.5" aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <i
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-sm bg-line-2",
                    score >= i && (score === 1 ? "bg-danger" : score === 2 ? "bg-gold" : "bg-brand"),
                  )}
                />
              ))}
            </div>
            <p id={strengthId} className="sr-only" aria-live="polite">
              Robustesse du mot de passe : {STRENGTH_LABEL[score]}
            </p>
          </>
        ) : null}
        {hint ? (
          <p id={hintId} className="mt-1.5 text-[13px] text-ink-3">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="mt-1.5 text-[13px] font-semibold text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

/* ------------------------------------------------------------------ */
/* Saisie de code à 6 chiffres — port de `.codeboxes`                   */
/* ------------------------------------------------------------------ */

export function OtpInput({
  value,
  onChange,
  length = 6,
  label = "Code de vérification",
  disabled,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  label?: string;
  disabled?: boolean;
  error?: string | null;
}) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const groupId = React.useId();

  const setAt = (index: number, char: string) => {
    const chars = value.padEnd(length, " ").split("");
    chars[index] = char || " ";
    onChange(chars.join("").replace(/ /g, "").slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setAt(index, "");
      return;
    }
    // Collage d'un code entier depuis n'importe quelle case.
    if (digits.length > 1) {
      onChange(digits.slice(0, length));
      refs.current[Math.min(digits.length, length - 1)]?.focus();
      return;
    }
    const chars = value.split("");
    chars[index] = digits;
    onChange(chars.join("").slice(0, length));
    refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
      onChange(value.slice(0, index - 1) + value.slice(index));
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  return (
    <div role="group" aria-labelledby={`${groupId}-label`} aria-describedby={error ? `${groupId}-error` : undefined}>
      <span id={`${groupId}-label`} className="sr-only">
        {label}, {length} chiffres
      </span>
      <div className="my-1 flex justify-center gap-2.5">
        {Array.from({ length }).map((_, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={value[i] ?? ""}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={length}
            aria-label={`Chiffre ${i + 1}`}
            aria-invalid={error ? true : undefined}
            className={cn(
              // `nk-field-size` : ces cases sont volontairement à 22 px, le
              // plancher mobile à 16 px ne doit pas les rabaisser.
              "nk-field-size size-[48px] h-14 rounded-xl border-[1.5px] border-line bg-card text-center font-display text-[22px] font-extrabold text-ink",
              "outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/25",
              "disabled:opacity-50",
              error && "border-danger",
            )}
          />
        ))}
      </div>
      {error ? (
        <p id={`${groupId}-error`} className="mt-2 text-center text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Case à cocher carrée des filtres — port de `.fopt`                   */
/* ------------------------------------------------------------------ */

export function CheckOption({
  checked,
  onCheckedChange,
  label,
  count,
  name,
  value,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  count?: number;
  name?: string;
  value?: string;
}) {
  return (
    <label className="group flex cursor-pointer select-none items-center gap-3 py-1.5 text-[14.5px] font-medium text-ink hover:text-brand">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-[19px] shrink-0 place-items-center rounded-md border-[1.8px] border-line bg-card transition",
          "peer-checked:border-brand peer-checked:bg-brand",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-brand/25",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("size-3 text-white transition", checked ? "opacity-100" : "opacity-0")}
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span className="flex-1">{label}</span>
      {typeof count === "number" ? (
        <span className="text-[13px] font-bold text-ink-3">{count}</span>
      ) : null}
    </label>
  );
}
