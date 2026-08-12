"use client";

import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/** Clôt une réduction avant son terme. `endDiscount` existait sans appelant. */
export function EndDiscountButton({ discountId }: { discountId: string }) {
  const end = useAction(() => api.del(`/api/admin/pricing/discounts/${discountId}`), {
    success: "Réduction close.",
    error: "La clôture a échoué.",
  });

  return (
    <Btn size="sm" variant="o" onClick={() => void end.run()} loading={end.pending}>
      Clore
    </Btn>
  );
}
