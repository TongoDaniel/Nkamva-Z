"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

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
  const router = useRouter();
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const otherRole: SubRole = currentRole === "FINANCES" ? "MODERATION" : "FINANCES";

  async function switchRole() {
    setPending(true);
    try {
      await api.patch(`/api/admin/admins/${userId}`, { adminRole: otherRole });
      toast.success(`${userName} passe en ${LABELS[otherRole]}.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Le changement a échoué.");
    } finally {
      setPending(false);
    }
  }

  async function closeAccount() {
    setPending(true);
    try {
      await api.del(`/api/admin/admins/${userId}`);
      toast.success(`Le compte de ${userName} est fermé.`);
      setConfirmClose(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "La fermeture a échoué.");
    } finally {
      setPending(false);
    }
  }

  // Rouvrir n'est pas destructeur et ne demande donc pas de confirmation : la
  // fenêtre modale est réservée à ce qui coupe un accès, pas à ce qui le rend.
  async function reopenAccount() {
    setPending(true);
    try {
      await api.post(`/api/admin/admins/${userId}`);
      toast.success(`Le compte de ${userName} est rouvert.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "La réouverture a échoué.");
    } finally {
      setPending(false);
    }
  }

  if (suspended) {
    return (
      <div className="flex flex-wrap gap-2">
        <Btn size="sm" variant="o" onClick={reopenAccount} loading={pending}>
          Rouvrir le compte
        </Btn>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Btn size="sm" variant="o" onClick={switchRole} loading={pending && !confirmClose}>
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
            <Btn variant="danger" onClick={closeAccount} loading={pending}>
              Fermer le compte
            </Btn>
            <Btn variant="o" onClick={() => setConfirmClose(false)}>
              Annuler
            </Btn>
          </>
        }
      />
    </div>
  );
}
