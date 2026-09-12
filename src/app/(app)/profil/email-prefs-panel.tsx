"use client";

import * as React from "react";
import { Hint } from "@/components/nk/hint";
import { CheckOption } from "@/components/nk/input";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import type { ProfileView } from "@/lib/profile";
import { SettingCard } from "@/components/nk/setting-card";

/**
 * Préférences d'email — **deux, et deux seulement** (arbitrage 119).
 *
 * Les cinq événements de F12.5 se rangent en deux catégories, pas cinq. Ce qui
 * est transactionnel — un reçu, une facture, un accès qui s'ouvre — n'apparaît
 * pas ici du tout : ce sont des preuves, et un réglage capable de les éteindre
 * transformerait une préférence de confort en perte de droits.
 *
 * Enregistrement immédiat plutôt que bouton « Enregistrer » : une case à cocher
 * isolée qui attendrait une validation laisse croire que le choix est pris alors
 * qu'il ne l'est pas. En cas d'échec, l'état revient à sa valeur d'origine —
 * l'écran ne doit jamais afficher une préférence que la base ne porte pas.
 */
export function EmailPrefsPanel({ profile }: { profile: ProfileView }) {
  return (
    <SettingCard
      title="Emails d'information"
      hint={
        <Hint label="Ce que ce réglage ne touche pas">
          Ce que NkamVa vous envoie en plus de vos notifications. Vos reçus d&apos;achat, vos
          factures, l&apos;ouverture de vos accès, et tout ce qui touche à un impayé, à un
          litige ou à la sécurité de votre compte ne sont pas concernés : ils partent
          toujours.
        </Hint>
      }
    >
      <div className="flex flex-col gap-5">
        <PrefToggle
          name="relationalEmails"
          initial={profile.relationalEmails}
          label="Messages et invitations"
          help="Un nouveau message dans une de vos communautés, et l'acceptation d'une invitation que vous avez envoyée. Désactivé, l'information reste consultable dans vos notifications."
          onLabel="Vous serez prévenu par email de vos messages et invitations."
          offLabel="Ces emails sont désactivés. L'information reste dans vos notifications."
        />
        <PrefToggle
          name="subscriptionNoticeEmails"
          initial={profile.subscriptionNoticeEmails}
          label="Changements de tarif de l'abonnement formateur"
          help="L'annonce quand une nouvelle grille est publiée, et le rappel à l'échéance qui l'applique. Désactivé, l'avis reste consultable dans vos notifications."
          onLabel="Vous recevrez les emails d'information sur votre abonnement."
          offLabel="Ces emails sont désactivés. Les avis restent dans vos notifications."
        />
      </div>
    </SettingCard>
  );
}

/**
 * Une préférence, une case. Chacune enregistre pour son compte : deux réglages
 * distincts qui partageraient une requête feraient retomber le second quand le
 * premier échoue.
 */
function PrefToggle({
  name,
  initial,
  label,
  help,
  onLabel,
  offLabel,
}: {
  name: "relationalEmails" | "subscriptionNoticeEmails";
  initial: boolean;
  label: string;
  help: string;
  onLabel: string;
  offLabel: string;
}) {
  const [enabled, setEnabled] = React.useState(initial);

  // Bascule optimiste : la case suit le doigt, et retombe si le serveur refuse.
  const save = useAction(
    async (next: boolean) => {
      await api.patch("/api/me/profile", { [name]: next });
      return next;
    },
    {
      success: (next: boolean) => (next ? onLabel : offLabel),
      error: "Le réglage n'a pas pu être enregistré.",
      // La case n'a bougé que d'un cran : la remettre, c'est l'inverser.
      onError: () => setEnabled((v) => !v),
      // Rien d'autre à l'écran ne dépend de ce réglage : un rendu serveur de
      // plus ne changerait rien d'affiché, et coûterait un aller-retour.
      refresh: false,
    },
  );

  function toggle(next: boolean) {
    setEnabled(next);
    void save.run(next);
  }

  return (
    <fieldset disabled={save.pending} className="disabled:opacity-60">
      <legend className="sr-only">{label}</legend>
      {/* Le ⓘ vit à côté de la case, jamais dedans : `CheckOption` est un
          `<label>` entier, et un bouton posé à l'intérieur basculerait la
          préférence au moindre clic. Le paragraphe d'aide qui suivait chaque
          case coûtait trois lignes pour un interrupteur (arbitrage 138). */}
      <div className="flex items-center gap-1">
        <CheckOption checked={enabled} onCheckedChange={toggle} name={name} label={label} />
        <Hint label={`Ce que couvre « ${label} »`}>{help}</Hint>
      </div>
    </fieldset>
  );
}
