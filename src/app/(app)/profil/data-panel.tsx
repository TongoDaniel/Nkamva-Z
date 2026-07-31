"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { Field } from "@/components/nk/input";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import { DELETION_GRACE_DAYS } from "@/lib/dto";
import type { ProfileView } from "@/lib/profile";
import { SettingCard, SettingRow } from "./setting-card";

const CONFIRM_WORD = "SUPPRIMER";

export function DataPanel({ profile }: { profile: ProfileView }) {
  const router = useRouter();
  const [exporting, setExporting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmWord, setConfirmWord] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function onExport() {
    setExporting(true);
    try {
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
      toast.success("Export téléchargé.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'export a échoué. Réessayez.");
    } finally {
      setExporting(false);
    }
  }

  async function onRequestDeletion() {
    setPending(true);
    try {
      await api.post("/api/me/deletion");
      setConfirmOpen(false);
      setConfirmWord("");
      toast.success("Suppression programmée. Vous pouvez encore l'annuler.");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "La demande a échoué. Réessayez.",
      );
    } finally {
      setPending(false);
    }
  }

  async function onCancelDeletion() {
    setPending(true);
    try {
      await fetch("/api/me/deletion", { method: "DELETE" });
      toast.success("Suppression annulée. Votre compte est conservé.");
      router.refresh();
    } catch {
      toast.error("L'annulation a échoué. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SettingCard
        title="Vos données personnelles"
        subtitle="Vous pouvez récupérer à tout moment une copie complète des données que NkamVa détient sur vous."
      >
        <SettingRow
          title="Copie de vos données"
          description="Fichier JSON : profil, achats, progression, abonnements, notifications et journal de vos actions."
          action={
            <Btn variant="o" size="sm" loading={exporting} onClick={onExport}>
              <Download aria-hidden="true" />
              Télécharger
            </Btn>
          }
        />
        {profile.gdprExportRequestedAt ? (
          <p className="pt-1 text-[12.5px] text-ink-3">
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
            <p className="mb-4 rounded-nk bg-danger-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-danger">
              Suppression demandée le {fmtDate(profile.deletionRequestedAt)}. Effacement prévu
              le {fmtDate(profile.deletionScheduledAt)}. D&apos;ici là, votre compte reste
              pleinement utilisable.
            </p>
            <Btn loading={pending} onClick={onCancelDeletion}>
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
              loading={pending}
              disabled={confirmWord.trim().toUpperCase() !== CONFIRM_WORD}
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
      </Modal>
    </>
  );
}
