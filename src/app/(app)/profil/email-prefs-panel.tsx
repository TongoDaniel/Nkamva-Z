"use client";

import * as React from "react";
import { CheckOption } from "@/components/nk/input";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
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
  const [enabled, setEnabled] = React.useState(profile.subscriptionNoticeEmails);

  // Bascule optimiste : la case suit le doigt, et retombe si le serveur refuse.
  const save = useAction(
    async (next: boolean) => {
      await api.patch("/api/me/profile", { subscriptionNoticeEmails: next });
      return next;
    },
    {
      success: (next) =>
        next
          ? "Vous recevrez les emails d'information sur votre abonnement."
          : "Ces emails sont désactivés. Les avis restent dans vos notifications.",
      error: "Le réglage n'a pas pu être enregistré.",
      // La case n'a bougé que d'un cran : la remettre, c'est l'inverser.
      onError: () => setEnabled((v) => !v),
    },
  );

  function toggle(next: boolean) {
    setEnabled(next);
    void save.run(next);
  }

  return (
    <SettingCard
      title="Emails d'information"
      subtitle="Ce que NkamVa vous envoie en plus de vos notifications. Les messages liés à vos factures, à un impayé, à un litige ou à la sécurité de votre compte ne sont pas concernés : ils partent toujours."
    >
      <fieldset disabled={save.pending} className="disabled:opacity-60">
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
