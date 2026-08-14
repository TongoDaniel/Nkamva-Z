"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

const MIN = 20;

/**
 * Éléments apportés au dossier par le formateur.
 * Ils partent vers la modération, pas dans le fil du litige : l'apprenant ne
 * les lit pas, de même que le formateur ne lit pas le détail de son motif.
 */
export function ContestForm({ disputeId }: { disputeId: string }) {
  const [reason, setReason] = React.useState("");

  const contest = useAction(
    () => api.post(`/api/trainer/disputes/${disputeId}/contest`, { reason: reason.trim() }),
    {
      success: "Vos éléments ont été transmis à la modération.",
      error: "L'envoi a échoué. Réessayez.",
      onSuccess: () => setReason(""),
    },
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void contest.run();
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="contest-reason" className="mb-1.5 block text-[13.5px] font-bold text-ink">
        Vos éléments
      </label>
      <textarea
        id="contest-reason"
        rows={5}
        maxLength={3000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ce qui figure au programme, les captures ou références qui l'attestent, tout élément utile à l'examen."
        aria-describedby="contest-hint"
        className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
      />
      <p id="contest-hint" className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        {reason.trim().length < MIN
          ? `Encore ${MIN - reason.trim().length} caractères.`
          : "Ces éléments ne sont lus que par l'équipe de modération."}
      </p>
      <div className="mt-3 flex justify-end">
        <Btn type="submit" loading={contest.pending} disabled={reason.trim().length < MIN}>
          <Send aria-hidden="true" />
          Transmettre
        </Btn>
      </div>
    </form>
  );
}
