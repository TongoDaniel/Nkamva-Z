"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/** Plan d'action 3.2 : saisir le marketing payant d'un mois. */
export function MarketingForm({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = React.useState(defaultMonth);
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const save = useAction(
    async () => {
      await api.post("/api/admin/pilotage/marketing", { month, amountFcfa: Number(amount), note: note || null });
      router.refresh();
    },
    { success: "Dépense enregistrée.", error: "La dépense n'a pas pu être enregistrée." },
  );
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (amount !== "" && Number.isInteger(Number(amount))) void save.run();
      }}
    >
      <label className="grid gap-1 text-[13px] font-bold">
        Mois
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-nk border border-line px-3 py-2 font-normal" />
      </label>
      <label className="grid gap-1 text-[13px] font-bold">
        Dépense (FCFA)
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} className="w-40 rounded-nk border border-line px-3 py-2 font-normal" />
      </label>
      <label className="grid min-w-0 flex-1 gap-1 text-[13px] font-bold">
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Campagne, canal…" className="rounded-nk border border-line px-3 py-2 font-normal" />
      </label>
      <Btn size="sm" type="submit" loading={save.pending}>Enregistrer</Btn>
    </form>
  );
}
