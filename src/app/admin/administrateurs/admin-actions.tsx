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
 * cette rangée : `changeAdminRole` et `revokeAdmin` refusent tout ce qui le
 * touche, dans un sens comme dans l'autre — la ligne l'annonce plutôt que de
 * proposer un bouton qui échouerait systématiquement.
 *
 * Cet écran n'est ouvert qu'au Super-admin (`requireAdminSubRole`), donc
 * l'acteur n'est jamais la personne visée par ces boutons : pas de garde
 * « soi-même » à poser ici, contrairement à `revokeAdmin` côté service, qui
 * reste sollicitable ailleurs.
 */
export function AdminActions({
  userId,
  userName,
  currentRole,
}: {
  userId: string;
  userName: string;
  currentRole: SubRole;
}) {
  const router = useRouter();
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);
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

  async function revoke() {
    setPending(true);
    try {
      await api.del(`/api/admin/admins/${userId}`);
      toast.success(`${userName} n'a plus de droits d'administration.`);
      setConfirmRevoke(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Le retrait a échoué.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Btn size="sm" variant="o" onClick={switchRole} loading={pending && !confirmRevoke}>
        Passer en {LABELS[otherRole]}
      </Btn>
      <Btn size="sm" variant="danger" onClick={() => setConfirmRevoke(true)}>
        Retirer les droits
      </Btn>

      <Modal
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title={`Retirer les droits de ${userName}`}
        description="Le compte redevient un apprenant ordinaire. Rien n'est supprimé : il pourra être recréé administrateur plus tard si besoin."
        footer={
          <>
            <Btn variant="danger" onClick={revoke} loading={pending}>
              Retirer les droits
            </Btn>
            <Btn variant="o" onClick={() => setConfirmRevoke(false)}>
              Annuler
            </Btn>
          </>
        }
      />
    </div>
  );
}
