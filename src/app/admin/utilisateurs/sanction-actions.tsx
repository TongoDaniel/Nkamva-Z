"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

type Level = "NONE" | "RESTRICTED" | "BANNED";

const COPY: Record<Exclude<Level, "NONE">, { title: string; description: string; cta: string }> = {
  RESTRICTED: {
    title: "Restreindre ce compte",
    description:
      "Le compte reste accessible et conserve tout ce qu'il a payé, mais ne peut plus écrire : ni ouvrir de litige, ni poster de message.",
    cta: "Restreindre",
  },
  BANNED: {
    title: "Exclure ce compte",
    description:
      "La connexion est coupée et l'accès aux ressources déjà payées est retiré. C'est une privation de biens achetés : elle peut légitimement produire un litige.",
    cta: "Exclure",
  },
};

export function SanctionActions({
  userId,
  userName,
  level,
  isSuperAdmin,
}: {
  userId: string;
  userName: string;
  level: Level;
  isSuperAdmin: boolean;
}) {
  const [dialog, setDialog] = React.useState<Level | null>(null);
  const [reason, setReason] = React.useState("");

  // Le niveau est rendu par l'appel pour que le message de réussite puisse le
  // relire : `success` reçoit le résultat, pas les arguments.
  const apply = useAction(
    async (next: Level) => {
      await api.post(`/api/admin/users/${userId}/sanction`, { level: next, reason: reason.trim() });
      return next;
    },
    {
      success: (next) => (next === "NONE" ? "Compte rétabli." : "Sanction appliquée."),
      error: "L'action a échoué.",
      onSuccess: () => {
        setDialog(null);
        setReason("");
      },
    },
  );

  // Lever une exclusion pèse autant que la prononcer : même réserve.
  const canLift = level !== "BANNED" || isSuperAdmin;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {level === "NONE" ? (
          <>
            <Btn size="sm" variant="o" onClick={() => setDialog("RESTRICTED")}>
              Restreindre
            </Btn>
            {isSuperAdmin ? (
              <Btn size="sm" variant="danger" onClick={() => setDialog("BANNED")}>
                Exclure
              </Btn>
            ) : null}
          </>
        ) : (
          <>
            {canLift ? (
              <Btn size="sm" variant="o" onClick={() => setDialog("NONE")}>
                Rétablir
              </Btn>
            ) : (
              <span className="text-[13px] text-ink-3">Levée réservée au Super-admin</span>
            )}
            {level === "RESTRICTED" && isSuperAdmin ? (
              <Btn size="sm" variant="danger" onClick={() => setDialog("BANNED")}>
                Exclure
              </Btn>
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialog === "NONE" ? "Rétablir ce compte" : dialog ? COPY[dialog].title : ""}
        description={
          dialog === "NONE"
            ? `${userName} retrouvera toutes ses possibilités.`
            : dialog
              ? COPY[dialog].description
              : ""
        }
        footer={
          <>
            <Btn
              variant={dialog === "BANNED" ? "danger" : undefined}
              loading={apply.pending}
              disabled={reason.trim().length < 10}
              onClick={() => dialog && void apply.run(dialog)}
            >
              {dialog === "NONE" ? "Rétablir" : dialog ? COPY[dialog].cta : ""}
            </Btn>
            <Btn variant="o" onClick={() => setDialog(null)}>
              Annuler
            </Btn>
          </>
        }
      >
        <label htmlFor={`reason-${userId}`} className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Motif
        </label>
        <textarea
          id={`reason-${userId}`}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Il sera consigné au journal et transmis à la personne concernée."
          className="w-full rounded-nk-sm border border-line bg-card px-3 py-2 text-[14px] text-ink outline-none focus-visible:border-brand"
        />
      </Modal>
    </>
  );
}
