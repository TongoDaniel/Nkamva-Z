"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

type SubRole = "FINANCES" | "MODERATION";

const LABELS: Record<SubRole, string> = { FINANCES: "Finances", MODERATION: "Modération" };

/**
 * Actions sur un administrateur non Super-admin. Un Super-admin n'a jamais
 * cette rangée : `changeAdminRole` et `deactivateAdmin` refusent tout ce qui le
 * touche, dans un sens comme dans l'autre — la ligne l'annonce plutôt que de
 * proposer un bouton qui échouerait systématiquement.
 *
 * Cet écran n'est ouvert qu'au Super-admin (`requireAdminSubRole`), donc
 * l'acteur n'est jamais la personne visée par ces boutons : pas de garde
 * « soi-même » à poser ici, contrairement à `deactivateAdmin` côté service, qui
 * reste sollicitable ailleurs.
 *
 * Fermer un compte ne le rétrograde pas (arbitrage 88) : la personne reste
 * administrateur, elle cesse de pouvoir se connecter. Le vocabulaire de
 * l'écran doit le dire — « retirer les droits » laissait entendre que le compte
 * redevenait ordinaire, ce qui est précisément ce qu'on ne fait plus.
 */
export function AdminActions({
  userId,
  userName,
  currentRole,
  suspended,
}: {
  userId: string;
  userName: string;
  currentRole: SubRole;
  suspended: boolean;
}) {
  const [confirmClose, setConfirmClose] = React.useState(false);
  const action = useKeyedAction();

  const otherRole: SubRole = currentRole === "FINANCES" ? "MODERATION" : "FINANCES";

  const switchRole = () =>
    void action.run("role", () => api.patch(`/api/admin/admins/${userId}`, { adminRole: otherRole }), {
      success: `${userName} passe en ${LABELS[otherRole]}.`,
      error: "Le changement a échoué.",
    });

  const closeAccount = () =>
    void action.run("close", () => api.del(`/api/admin/admins/${userId}`), {
      success: `Le compte de ${userName} est fermé.`,
      error: "La fermeture a échoué.",
      onSuccess: () => setConfirmClose(false),
    });

  // Rouvrir n'est pas destructeur et ne demande donc pas de confirmation : la
  // fenêtre modale est réservée à ce qui coupe un accès, pas à ce qui le rend.
  const reopenAccount = () =>
    void action.run("reopen", () => api.post(`/api/admin/admins/${userId}`), {
      success: `Le compte de ${userName} est rouvert.`,
      error: "La réouverture a échoué.",
    });

  if (suspended) {
    return (
      <div className="flex flex-wrap gap-2">
        <Btn size="sm" variant="o" onClick={reopenAccount} loading={action.isRunning("reopen")}>
          Rouvrir le compte
        </Btn>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Btn size="sm" variant="o" onClick={switchRole} loading={action.isRunning("role")}>
        Passer en {LABELS[otherRole]}
      </Btn>
      <Btn size="sm" variant="danger" onClick={() => setConfirmClose(true)}>
        Fermer le compte
      </Btn>

      <Modal
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={`Fermer le compte de ${userName}`}
        description="La personne ne pourra plus se connecter, et ses sessions ouvertes sont coupées immédiatement. Le compte reste un compte d'administration : il n'est ni supprimé, ni transformé en compte apprenant, et son journal d'audit reste lisible. Vous pourrez le rouvrir."
        footer={
          <>
            <Btn variant="danger" onClick={closeAccount} loading={action.isRunning("close")}>
              Fermer le compte
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setConfirmClose(false)}>
              Annuler
            </Btn>
          </>
        }
      />
    </div>
  );
}
