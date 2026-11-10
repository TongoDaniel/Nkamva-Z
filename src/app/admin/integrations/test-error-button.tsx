"use client";

import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/**
 * Plan d'action 0.4 : vérifier en production qu'une erreur remonte et alerte
 * (journal, e-mail, notification, webhook). L'erreur est volontaire et sans
 * effet sur les données.
 */
export function TestErrorButton() {
  const trigger = useAction(() => api.post("/api/admin/health/test-error", {}), {
    success: "Erreur de test envoyée : l'alerte doit arriver par e-mail et en notification.",
    error: "L'erreur de test n'a pas pu être déclenchée.",
  });
  return (
    <Btn variant="o" size="sm" loading={trigger.pending} onClick={() => void trigger.run()}>
      Tester l&apos;alerte d&apos;erreur
    </Btn>
  );
}
