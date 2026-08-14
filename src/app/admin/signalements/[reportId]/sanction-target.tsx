"use client";

import * as React from "react";
import { UserMinus } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/**
 * Sanctionner le compte visé par un signalement — décision 67.
 *
 * **Deux niveaux, et un seul ici.** La Modération met en lecture seule : le
 * compte se connecte encore et garde ce qu'il a acheté, il ne peut plus
 * publier, acheter ni écrire. Couper la connexion est réservé au Super-admin,
 * parce que cela retire l'accès à des ressources **payées** et peut
 * légitimement produire un litige. L'écran ne propose donc l'exclusion qu'à
 * lui, plutôt que d'offrir à tous un bouton qui échouerait en 403.
 *
 * C'est le seul point d'entrée de la Modération sur un compte : la décision 7
 * lui refuse l'annuaire des utilisateurs. Elle sanctionne le dossier qu'elle
 * instruit, elle ne parcourt pas les comptes.
 */
export function SanctionTarget({
  userId,
  userLabel,
  currentLevel,
  isSuperAdmin,
}: {
  userId: string;
  userLabel: string;
  currentLevel: "NONE" | "RESTRICTED" | "BANNED";
  isSuperAdmin: boolean;
}) {
  const action = useKeyedAction();
  const [dialog, setDialog] = React.useState<null | "RESTRICTED" | "BANNED" | "NONE">(null);
  const [reason, setReason] = React.useState("");

  function apply(level: "RESTRICTED" | "BANNED" | "NONE") {
    void action.run(
      level,
      () => api.post(`/api/admin/users/${userId}/sanction`, { level, reason: reason.trim() }),
      {
        success:
          level === "NONE"
            ? "Sanction levée."
            : level === "RESTRICTED"
              ? "Compte mis en lecture seule."
              : "Compte fermé : la connexion est coupée.",
        onSuccess: () => {
          setDialog(null);
          setReason("");
        },
      },
    );
  }

  // Une levée de `BANNED` est aussi lourde que la pose : le service la réserve
  // au Super-admin, l'écran le dit avant le clic.
  const canLift = currentLevel !== "NONE" && (isSuperAdmin || currentLevel === "RESTRICTED");

  return (
    <div className="mt-4 border-t border-line-2 pt-4">
      <p className="mb-3 text-[13px] font-bold text-ink-3">Le compte signalé</p>

      <div className="grid gap-2.5">
        {currentLevel === "NONE" ? (
          <Btn block variant="o" onClick={() => setDialog("RESTRICTED")}>
            <UserMinus aria-hidden="true" />
            Mettre en lecture seule
          </Btn>
        ) : null}

        {isSuperAdmin && currentLevel !== "BANNED" ? (
          <Btn block variant="danger" onClick={() => setDialog("BANNED")}>
            Fermer le compte
          </Btn>
        ) : null}

        {canLift ? (
          <Btn block variant="t" onClick={() => setDialog("NONE")}>
            Lever la sanction
          </Btn>
        ) : null}
      </div>

      {currentLevel === "RESTRICTED" ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          Ce compte est déjà en lecture seule : il se connecte, il ne publie plus.
        </p>
      ) : currentLevel === "BANNED" ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          Ce compte est fermé. Seul un Super-admin peut lui rendre l&apos;accès.
        </p>
      ) : !isSuperAdmin ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          Couper la connexion retire l&apos;accès à des ressources payées : cette décision revient
          au Super-admin.
        </p>
      ) : null}

      <Modal
        open={dialog !== null}
        onOpenChange={(open) => setDialog(open ? dialog : null)}
        title={
          dialog === "NONE"
            ? "Lever la sanction ?"
            : dialog === "BANNED"
              ? "Fermer ce compte ?"
              : "Mettre ce compte en lecture seule ?"
        }
        description={
          dialog === "NONE"
            ? `${userLabel} retrouve l'usage complet de son compte.`
            : dialog === "BANNED"
              ? `${userLabel} ne pourra plus se connecter, y compris à ce qu'il a acheté.`
              : `${userLabel} se connectera encore et gardera ses achats, mais ne pourra plus publier, acheter ni écrire.`
        }
        footer={
          <>
            <Btn
              variant={dialog === "BANNED" ? "danger" : "p"}
              loading={dialog !== null && action.isRunning(dialog)}
              disabled={reason.trim().length < 10}
              onClick={() => dialog && apply(dialog)}
            >
              Confirmer
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <label htmlFor="sanction-motif" className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Motif (conservé au journal, obligatoire)
        </label>
        <textarea
          id="sanction-motif"
          rows={3}
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ce que ce compte a fait, et ce qui a été vérifié."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
        <p className="mt-2 text-[13px] text-ink-3">Dix caractères au minimum.</p>
      </Modal>
    </div>
  );
}
