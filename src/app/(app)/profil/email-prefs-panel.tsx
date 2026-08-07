"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckOption } from "@/components/nk/input";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import type { ProfileView } from "@/lib/profile";
import { SettingCard } from "@/components/nk/setting-card";

/**
 * Préférences d'email.
 *
 * Enregistrement immédiat plutôt que bouton « Enregistrer » : une case à cocher
 * isolée qui attendrait une validation laisse croire que le choix est pris alors
 * qu'il ne l'est pas. En cas d'échec, l'état revient à sa valeur d'origine —
 * l'écran ne doit jamais afficher une préférence que la base ne porte pas.
 */
export function EmailPrefsPanel({ profile }: { profile: ProfileView }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(profile.subscriptionNoticeEmails);
  const [pending, setPending] = React.useState(false);

  async function toggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setPending(true);
    try {
      await api.patch("/api/me/profile", { subscriptionNoticeEmails: next });
      toast.success(
        next
          ? "Vous recevrez les emails d'information sur votre abonnement."
          : "Ces emails sont désactivés. Les avis restent dans vos notifications.",
      );
      router.refresh();
    } catch (err) {
      setEnabled(previous);
      toast.error(
        err instanceof ApiError ? err.message : "Le réglage n'a pas pu être enregistré.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingCard
      title="Emails d'information"
      subtitle="Ce que NkamVa vous envoie en plus de vos notifications. Les messages liés à vos factures, à un impayé, à un litige ou à la sécurité de votre compte ne sont pas concernés : ils partent toujours."
    >
      <fieldset disabled={pending} className="disabled:opacity-60">
        <legend className="sr-only">Préférences d&apos;email</legend>
        <CheckOption
          checked={enabled}
          onCheckedChange={toggle}
          name="subscriptionNoticeEmails"
          label="Changements de tarif de l'abonnement formateur"
        />
        <p className="mt-1.5 max-w-[60ch] text-[12.5px] leading-relaxed text-ink-2">
          L&apos;annonce quand une nouvelle grille est publiée, et le rappel à l&apos;échéance qui
          l&apos;applique. Désactivé, l&apos;avis reste consultable dans vos notifications.
        </p>
      </fieldset>
    </SettingCard>
  );
}
