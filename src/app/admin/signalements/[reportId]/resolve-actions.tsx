"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EyeOff, ThumbsDown } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

/**
 * Deux issues, et une seule sanction disponible : retirer la ressource du
 * catalogue. Suspendre un compte n'a ni route ni règle arbitrée — l'écran le
 * dit plutôt que de proposer un bouton qui échouerait.
 */
export function ResolveActions({
  reportId,
  status,
  updatedAt,
  hideable,
  targetLabel,
}: {
  reportId: string;
  status: string;
  updatedAt: string;
  hideable: boolean;
  targetLabel: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<null | "uphold" | "dismiss">(null);
  const [note, setNote] = React.useState("");
  const [hide, setHide] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  if (status !== "OPEN") {
    return (
      <p className="text-[13px] leading-relaxed text-ink-2">
        Ce signalement est tranché. Il reste consultable pour l&apos;audit.
      </p>
    );
  }

  async function resolve(nextStatus: "UPHELD" | "DISMISSED") {
    setPending(true);
    try {
      await api.post(`/api/admin/reports/${reportId}/resolve`, {
        status: nextStatus,
        decisionNote: note.trim(),
        hideTarget: nextStatus === "UPHELD" && hideable && hide,
        expectedUpdatedAt: updatedAt,
      });
      toast.success(nextStatus === "UPHELD" ? "Signalement retenu." : "Signalement rejeté.");
      setDialog(null);
      setNote("");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
        if (err.code === "STALE_REPORT") router.refresh();
        return;
      }
      toast.error("L'action a échoué. Réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="grid gap-2.5">
        <Btn block variant="danger" onClick={() => setDialog("uphold")}>
          <EyeOff aria-hidden="true" />
          Retenir le signalement
        </Btn>
        <Btn block variant="o" onClick={() => setDialog("dismiss")}>
          <ThumbsDown aria-hidden="true" />
          Rejeter
        </Btn>
      </div>

      {!hideable ? (
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
          Aucune sanction automatique n&apos;est disponible sur cet objet : seule une ressource
          peut être retirée du catalogue. Retenir le signalement le trace et prévient son
          auteur, sans autre effet.
        </p>
      ) : null}

      <Modal
        open={dialog === "uphold"}
        onOpenChange={(open) => setDialog(open ? "uphold" : null)}
        title="Retenir ce signalement ?"
        description="L'auteur du signalement est prévenu, avec votre motivation."
        footer={
          <>
            <Btn
              variant="danger"
              loading={pending}
              disabled={note.trim().length < 10}
              onClick={() => resolve("UPHELD")}
            >
              Retenir
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        {hideable ? (
          <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-nk border-[1.5px] border-line p-3.5 hover:border-brand/40">
            <input
              type="checkbox"
              checked={hide}
              onChange={(e) => setHide(e.target.checked)}
              className="mt-0.5 size-4 accent-brand"
            />
            <span>
              <b className="block text-[13.5px] font-bold text-ink">
                Retirer « {targetLabel} » du catalogue
              </b>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">
                La ressource n&apos;apparaît plus au catalogue. Les personnes qui l&apos;ont
                achetée gardent leur accès : l&apos;achat est définitif, et un retrait ne
                rembourse personne.
              </span>
            </span>
          </label>
        ) : null}

        <label htmlFor="uphold-note" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Motivation, transmise à l&apos;auteur du signalement
        </label>
        <textarea
          id="uphold-note"
          rows={4}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="La ressource reprend sans autorisation un contenu protégé."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>

      <Modal
        open={dialog === "dismiss"}
        onOpenChange={(open) => setDialog(open ? "dismiss" : null)}
        title="Rejeter ce signalement ?"
        description="Rien ne change pour l'objet visé. L'auteur du signalement est prévenu."
        footer={
          <>
            <Btn loading={pending} disabled={note.trim().length < 10} onClick={() => resolve("DISMISSED")}>
              Rejeter
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <label htmlFor="dismiss-note" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Motivation, transmise à l&apos;auteur du signalement
        </label>
        <textarea
          id="dismiss-note"
          rows={4}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Le contenu signalé ne contrevient pas aux règles de la plateforme."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>
    </>
  );
}
