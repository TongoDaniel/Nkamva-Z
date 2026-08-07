"use client";

import * as React from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Field } from "@/components/nk/input";
import { FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";
import { EMAIL_ERROR, isValidEmail } from "@/lib/validation";
import { cn } from "@/lib/utils";

const SUBJECTS = [
  { value: "ACHAT", label: "Un achat ou un paiement" },
  { value: "ACCES", label: "Un problème d'accès à une ressource" },
  { value: "REMBOURSEMENT", label: "Un remboursement ou une contestation" },
  { value: "FORMATEUR", label: "Devenir formateur ou publier" },
  { value: "COMPTE", label: "Mon compte" },
  { value: "AUTRE", label: "Autre sujet" },
];

const MIN_MESSAGE = 20;

export function ContactForm({ responseHours }: { responseHours: number }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [subject, setSubject] = React.useState(SUBJECTS[0].value);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // `noValidate` désactive le contrôle du navigateur : à refaire ici.
    const issues: Record<string, string> = {};
    if (!name.trim()) issues.name = "Renseignez votre nom.";
    if (!email.trim()) issues.email = "Renseignez votre adresse e-mail.";
    else if (!isValidEmail(email)) issues.email = EMAIL_ERROR;
    if (message.trim().length < MIN_MESSAGE) {
      issues.message = `Décrivez votre demande en ${MIN_MESSAGE} caractères au minimum.`;
    }
    if (Object.keys(issues).length > 0) {
      setFieldErrors(issues);
      if (Object.keys(issues).length > 1) {
        setError("Plusieurs champs demandent une correction.");
      }
      return;
    }

    setFieldErrors({});
    setPending(true);
    try {
      await api.post("/api/contact", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject,
        message: message.trim(),
      });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          setFieldErrors(
            Object.fromEntries(
              err.details
                .filter((d) => d.field && d.reason)
                .map((d) => [d.field as string, d.reason as string]),
            ),
          );
        }
        setError(err.message);
      } else {
        setError("L'envoi a échoué. Réessayez dans un instant.");
      }
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-nk-lg border border-line bg-card p-8 text-center shadow-nk-sm"
      >
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-brand-tint text-brand">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h2 className="mb-2 text-[20px] font-extrabold">Message envoyé</h2>
        <p className="mx-auto max-w-[44ch] text-ink-2">
          Nous vous répondons à <b className="text-ink">{email}</b> sous {responseHours} heures
          ouvrées.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8"
    >
      <FormError>{error}</FormError>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field
          label="Votre nom"
          required
          autoComplete="name"
          placeholder="Aminata Diallo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <Field
          label="Votre adresse e-mail"
          type="email"
          required
          autoComplete="email"
          placeholder="vous@exemple.com"
          hint="C'est à cette adresse que nous répondrons."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
      </div>

      <fieldset className="mb-[18px]">
        <legend className="mb-2.5 text-[13.5px] font-bold text-ink">Votre demande porte sur</legend>
        <div className="grid gap-2">
          {SUBJECTS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-nk border-[1.5px] px-4 py-2.5 text-[14px] transition",
                subject === option.value
                  ? "border-brand bg-brand-tint"
                  : "border-line hover:border-ink-3",
              )}
            >
              <input
                type="radio"
                name="subject"
                value={option.value}
                checked={subject === option.value}
                onChange={() => setSubject(option.value)}
                className="size-4 shrink-0 accent-brand"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="contact-message" className="mb-1.5 block text-[13.5px] font-bold text-ink">
        Votre message
      </label>
      <textarea
        id="contact-message"
        rows={6}
        required
        maxLength={5000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Décrivez votre situation. Si votre demande concerne un achat, indiquez le nom de la ressource."
        aria-describedby="contact-message-hint"
        aria-invalid={fieldErrors.message ? true : undefined}
        className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
      />
      <p id="contact-message-hint" className="mt-1.5 text-[12.5px] text-ink-3">
        {message.trim().length < MIN_MESSAGE
          ? `Encore ${MIN_MESSAGE - message.trim().length} caractères.`
          : "Plus votre message est précis, plus notre réponse le sera."}
      </p>
      {fieldErrors.message ? (
        <p className="mt-1.5 text-[12.5px] font-semibold text-danger">{fieldErrors.message}</p>
      ) : null}

      <Btn
        type="submit"
        size="lg"
        block
        className="mt-5"
        loading={pending}
        disabled={message.trim().length < MIN_MESSAGE}
      >
        <Send aria-hidden="true" />
        Envoyer
      </Btn>
    </form>
  );
}
