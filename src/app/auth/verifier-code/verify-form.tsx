"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { OtpInput } from "@/components/nk/input";
import { toast } from "@/components/nk/toast";
import { AuthHeading, AuthBackLink, FormError } from "@/components/layouts/auth-shell";
import { api, ApiError } from "@/lib/client";
import { fmtCountdown } from "@/lib/format";

const RESEND_SECONDS = 600;

/** Clé de transport du code entre l'écran de vérification et celui du mot de
 *  passe. sessionStorage plutôt que l'URL : pas d'historique, pas de referrer. */
export const RESET_CODE_KEY = "nk.reset";

export function VerifyCodeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const purpose = params.get("purpose") === "PASSWORD_RESET" ? "PASSWORD_RESET" : "EMAIL_VERIFICATION";

  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [remaining, setRemaining] = React.useState(RESEND_SECONDS);

  React.useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Saisissez les 6 chiffres du code.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await api.post("/api/auth/verify-otp", { email, code, purpose });
      if (purpose === "PASSWORD_RESET") {
        sessionStorage.setItem(RESET_CODE_KEY, JSON.stringify({ email, code }));
        router.push("/auth/nouveau-mot-de-passe");
      } else {
        router.push("/auth/connexion?verified=1");
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "La vérification a échoué. Réessayez.",
      );
      setCode("");
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    try {
      await api.post("/api/auth/otp", { email, purpose });
      setRemaining(RESEND_SECONDS);
      setCode("");
      toast.success("Un nouveau code vient d'être envoyé.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'envoi a échoué.");
    }
  }

  if (!email) {
    return (
      <>
        <AuthHeading
          title="Adresse manquante"
          subtitle="Reprenez depuis l'écran précédent pour recevoir un code."
        />
        <Btn asChild size="lg" block>
          <a href="/auth/mot-de-passe-oublie">Demander un code</a>
        </Btn>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        icon={<MailCheck aria-hidden="true" />}
        title="Entrez le code"
        subtitle={
          <>
            Nous avons envoyé un code à 6 chiffres à <b className="text-ink">{email}</b>
          </>
        }
      />
      <FormError>{error}</FormError>
      <form onSubmit={onSubmit} noValidate>
        <OtpInput
          value={code}
          onChange={setCode}
          disabled={pending}
          label={
            purpose === "PASSWORD_RESET"
              ? "Code de réinitialisation"
              : "Code de vérification de l'adresse e-mail"
          }
        />
        <div className="mt-4">
          <Btn type="submit" size="lg" block loading={pending}>
            Vérifier
          </Btn>
        </div>
      </form>
      <p className="mt-5 text-center text-sm text-ink-2">
        Vous n&apos;avez rien reçu ?{" "}
        {remaining > 0 ? (
          <>
            Renvoyer dans <b aria-live="off">{fmtCountdown(remaining)}</b>
          </>
        ) : (
          <button
            type="button"
            onClick={resend}
            className="cursor-pointer font-bold text-brand underline hover:text-brand-dark"
          >
            Renvoyer un code
          </button>
        )}
      </p>
      <AuthBackLink href="/auth/mot-de-passe-oublie">Modifier l&apos;e-mail</AuthBackLink>
    </>
  );
}
