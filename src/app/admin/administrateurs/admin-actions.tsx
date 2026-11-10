"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import {
  ADMIN_ROLE_CODES,
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  type AdminRoleCode,
} from "@/lib/admin-roles";

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
  currentRoles,
  suspended,
}: {
  userId: string;
  userName: string;
  /** Rôles cumulés (plan d'action, section 2). */
  currentRoles: AdminRoleCode[];
  suspended: boolean;
}) {
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [roles, setRoles] = React.useState<AdminRoleCode[]>(currentRoles);
  const action = useKeyedAction();
  const isOwner = currentRoles.includes("SUPER_ADMIN");

  const toggle = (role: AdminRoleCode) =>
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const saveRoles = () =>
    void action.run("role", () => api.patch(`/api/admin/admins/${userId}`, { adminRoles: roles }), {
      success: `Rôles de ${userName} mis à jour.`,
      error: "Le changement a échoué.",
      onSuccess: () => setEditing(false),
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
      <Btn size="sm" variant="o" onClick={() => { setRoles(currentRoles); setEditing(true); }}>
        Modifier les rôles
      </Btn>
      {isOwner ? null : (
        <Btn size="sm" variant="danger" onClick={() => setConfirmClose(true)}>
          Fermer le compte
        </Btn>
      )}

      <Modal
        open={editing}
        onOpenChange={setEditing}
        size="lg"
        title={`Rôles de ${userName}`}
        description="Les rôles se cumulent : la personne reçoit la somme de leurs permissions. Les règles de séparation des tâches s'appliquent quand même (personne ne propose et ne valide le même remboursement, le Commercial ne valide pas les candidatures)."
        footer={
          <>
            <Btn onClick={saveRoles} loading={action.isRunning("role")} disabled={roles.length === 0}>
              Enregistrer
            </Btn>
            <Btn variant="o" disabled={action.busy} onClick={() => setEditing(false)}>
              Annuler
            </Btn>
          </>
        }
      >
        <div className="grid gap-2">
          {ADMIN_ROLE_CODES.map((role) => {
            // Le Propriétaire ne se donne ni ne se retire ici (garde-fou de la console).
            const locked = role === "SUPER_ADMIN";
            return (
              <label
                key={role}
                className={`flex items-start gap-3 rounded-nk border border-line px-3.5 py-3 text-[13.5px] ${locked ? "opacity-60" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={roles.includes(role)}
                  disabled={locked}
                  onChange={() => toggle(role)}
                />
                <span>
                  <b className="block text-ink">{ADMIN_ROLE_LABELS[role]}</b>
                  <span className="text-ink-2">{ADMIN_ROLE_DESCRIPTIONS[role]}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Modal>

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
