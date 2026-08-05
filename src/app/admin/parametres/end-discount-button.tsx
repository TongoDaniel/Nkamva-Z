"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

/** Clôt une réduction avant son terme. `endDiscount` existait sans appelant. */
export function EndDiscountButton({ discountId }: { discountId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function end() {
    setPending(true);
    try {
      await api.del(`/api/admin/pricing/discounts/${discountId}`);
      toast.success("Réduction close.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "La clôture a échoué.");
      setPending(false);
    }
  }

  return (
    <Btn size="sm" variant="o" onClick={end} loading={pending}>
      Clore
    </Btn>
  );
}
