"use client";

import * as React from "react";
import { EyeOff, ThumbsDown } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { useKeyedAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";

/**
 * Deux issues, et un retrait quand la cible s'y prête : archivage pour une
 * ressource, retrait du fil pour un message. Suspendre un **compte** ou fermer
 * une **communauté** n'appartient pas à la Modération — l'écran le dit plutôt
 * que de proposer un bouton qui échouerait.
 *
 * Les mots du retrait viennent de l'appelant : ils changent selon la cible, et
 * les recopier ici ferait deux vérités pour une seule règle.
 */
export function ResolveActions({
  reportId,
  status,
  updatedAt,
  hideable,
  removalAction,
  removalEffect,
}: {
  reportId: string;
  status: string;
  updatedAt: string;
  hideable: boolean;
  removalAction: string;
  removalEffect: string;
}) {
  const action = useKeyedAction();
  const [dialog, setDialog] = React.useState<null | "uphold" | "dismiss">(null);
  const [note, setNote] = React.useState("");
  const [hide, setHide] = React.useState(true);

  if (status !== "OPEN") {
    return (
      <p className="text-[13px] leading-relaxed text-ink-2">
        Ce signalement est tranché. Il reste consultable pour l&apos;audit.
      </p>
    );
  }

  // La clé est l'issue choisie : les deux boutons partageaient un même booléen
  // et tournaient donc ensemble, sans dire lequel avait été cliqué.
  function resolve(nextStatus: "UPHELD" | "DISMISSED") {
    void action.run(
      nextStatus,
      () =>
        api.post(`/api/admin/reports/${reportId}/resolve`, {
          status: nextStatus,
          decisionNote: note.trim(),
          hideTarget: nextStatus === "UPHELD" && hideable && hide,
          expectedUpdatedAt: updatedAt,
        }),
      {
        success: nextStatus === "UPHELD" ? "Signalement retenu." : "Signalement rejeté.",
        onSuccess: () => {
          setDialog(null);
          setNote("");
        },
        refreshOnError: (err) => err instanceof ApiError && err.code === "STALE_REPORT",
      },
    );
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
          Aucun retrait n&apos;est possible sur cet objet — soit il est déjà retiré, soit il
          n&apos;appartient pas à la Modération de le faire : suspendre un compte revient au
          Super-admin, et fermer une communauté coupe des adhésions payées. Retenir le
          signalement le trace et prévient son auteur, sans autre effet.
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
              loading={action.isRunning("UPHELD")}
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
              <b className="block text-[13.5px] font-bold text-ink">{removalAction}</b>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">
                {removalEffect}
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
            <Btn loading={action.isRunning("DISMISSED")} disabled={note.trim().length < 10} onClick={() => resolve("DISMISSED")}>
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
