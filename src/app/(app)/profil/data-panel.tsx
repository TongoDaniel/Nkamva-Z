"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { Field, CheckOption } from "@/components/nk/input";
import { useKeyedAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import { DELETION_GRACE_DAYS } from "@/lib/dto";
import type { ProfileView } from "@/lib/profile";
import { Hint } from "@/components/nk/hint";
import { SettingCard, SettingRow } from "@/components/nk/setting-card";

const CONFIRM_WORD = "SUPPRIMER";

export function DataPanel({ profile }: { profile: ProfileView }) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmWord, setConfirmWord] = React.useState("");
  // Un reliquat trop petit pour être versé (A3) : le serveur le signale par
  // `WALLET_RESIDUE`, et la suppression ne passe qu'une fois son abandon coché.
  const [residueAsked, setResidueAsked] = React.useState<string | null>(null);
  const [residueAbandoned, setResidueAbandoned] = React.useState(false);
  const action = useKeyedAction();

  const onExport = () =>
    void action.run(
      "export",
      async () => {
        // Hors de `api` : la réponse est un fichier, pas l'enveloppe JSON.
        const res = await fetch("/api/me/gdpr-export");
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new ApiError(
            body?.error?.code ?? "EXPORT_FAILED",
            body?.error?.message ?? "L'export a échoué.",
            res.status,
          );
        }
        // Le corps est le fichier lui-même : on déclenche le téléchargement sans
        // quitter la page, puis on libère l'URL objet.
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `nkamva-donnees-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      },
      { success: "Export téléchargé.", error: "L'export a échoué. Réessayez." },
    );

  const onRequestDeletion = () =>
    void action.run(
      "request",
      () => api.post("/api/me/deletion", residueAbandoned ? { abandonResidue: true } : {}),
      {
        success: "Suppression programmée. Vous pouvez encore l'annuler.",
        error: "La demande a échoué. Réessayez.",
        onSuccess: () => {
          setConfirmOpen(false);
          setConfirmWord("");
          setResidueAsked(null);
          setResidueAbandoned(false);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "WALLET_RESIDUE") setResidueAsked(err.message);
        },
      },
    );

  const onCancelDeletion = () =>
    void action.run(
      "cancel",
      async () => {
        const res = await fetch("/api/me/deletion", { method: "DELETE" });
        // `fetch` ne lève pas sur un 4xx/5xx : sans ce contrôle, un refus du
        // serveur affichait « Suppression annulée » alors qu'elle courait
        // toujours.
        if (!res.ok) throw new Error("CANCEL_FAILED");
      },
      {
        success: "Suppression annulée. Votre compte est conservé.",
        error: "L'annulation a échoué. Réessayez.",
      },
    );

  return (
    <>
      {/* La carte d'export perd ses deux paragraphes : ce qu'on peut récupérer
          et ce que contient le fichier se lisent une fois (arbitrage 138). La
          carte de suppression, juste en dessous, n'y touche pas — un geste
          irréversible garde ses conséquences à l'air libre. */}
      <SettingCard
        title="Vos données personnelles"
        hint={
          <Hint label="Ce que vous pouvez récupérer">
            Vous pouvez récupérer à tout moment une copie complète des données que NKAMVA
            détient sur vous.
          </Hint>
        }
      >
        <SettingRow
          title="Copie de vos données"
          hint={
            <Hint label="Ce que contient le fichier">
              Fichier JSON : profil, achats, progression, abonnements, notifications et journal
              de vos actions.
            </Hint>
          }
          action={
            <Btn variant="o" size="sm" loading={action.isRunning("export")} onClick={onExport}>
              <Download aria-hidden="true" />
              Télécharger
            </Btn>
          }
        />
        {profile.gdprExportRequestedAt ? (
          <p className="pt-1 text-[13px] text-ink-3">
            Dernier export le {fmtDate(profile.gdprExportRequestedAt)}.
          </p>
        ) : null}
      </SettingCard>

      <SettingCard
        title="Supprimer mon compte"
        subtitle={`La suppression est différée de ${DELETION_GRACE_DAYS} jours : vous gardez la main pour l'annuler pendant ce délai.`}
      >
        {profile.deletionRequestedAt ? (
          <>
            <p className="mb-4 rounded-nk border border-line bg-card border-l-4 border-l-danger px-4 py-3.5 text-[13.5px] leading-relaxed text-danger rounded-l-sm">
              Suppression demandée le {fmtDate(profile.deletionRequestedAt)}. Effacement prévu
              le {fmtDate(profile.deletionScheduledAt)}. D&apos;ici là, votre compte reste
              pleinement utilisable.
            </p>
            <Btn loading={action.isRunning("cancel")} onClick={onCancelDeletion}>
              Annuler la suppression
            </Btn>
          </>
        ) : (
          <>
            <ul className="mb-5 grid gap-2 text-[13.5px] leading-relaxed text-ink-2">
              <li>Vos ressources achetées ne seront plus accessibles.</li>
              <li>
                Vos achats sont conservés de façon anonymisée : la comptabilité et les
                obligations fiscales l&apos;imposent.
              </li>
              <li>L&apos;opération est irréversible passé le délai de {DELETION_GRACE_DAYS} jours.</li>
            </ul>
            <Btn variant="danger" onClick={() => setConfirmOpen(true)}>
              Supprimer mon compte
            </Btn>
          </>
        )}
      </SettingCard>

      <Modal
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmWord("");
        }}
        title="Supprimer définitivement ce compte ?"
        description={`Pour confirmer, saisissez « ${CONFIRM_WORD} ». Vous disposerez ensuite de ${DELETION_GRACE_DAYS} jours pour revenir sur cette décision.`}
        footer={
          <>
            <Btn
              variant="danger"
              loading={action.isRunning("request")}
              disabled={
                confirmWord.trim().toUpperCase() !== CONFIRM_WORD || (residueAsked !== null && !residueAbandoned)
              }
              onClick={onRequestDeletion}
            >
              Programmer la suppression
            </Btn>
            <Btn variant="o" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Btn>
          </>
        }
      >
        <Field
          label={`Saisissez ${CONFIRM_WORD}`}
          value={confirmWord}
          autoComplete="off"
          onChange={(e) => setConfirmWord(e.target.value)}
        />
        {residueAsked ? (
          <div className="mt-4 grid gap-2">
            <p className="text-[13.5px] leading-relaxed text-ink-2">{residueAsked}</p>
            <CheckOption
              checked={residueAbandoned}
              onCheckedChange={setResidueAbandoned}
              label="J'abandonne ce solde. Il ne sera débité qu'à l'effacement : si j'annule la suppression, je le garde."
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
