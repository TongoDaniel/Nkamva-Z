"use client";

import * as React from "react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/** Réponse de la modération aux éléments apportés par un formateur. */
export function TicketReply({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  const reply = useAction(
    () =>
      api.post(`/api/admin/disputes/tickets/${ticketId}/resolve`, { resolutionNote: note.trim() }),
    {
      success: "Réponse transmise au formateur.",
      error: "L'envoi a échoué.",
      onSuccess: () => {
        setOpen(false);
        setNote("");
      },
    },
  );

  return (
    <>
      <Btn variant="o" size="sm" onClick={() => setOpen(true)}>
        Répondre au formateur
      </Btn>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Répondre au formateur"
        description="Votre réponse lui est notifiée. Elle n'apparaît pas dans le fil de l'acheteur."
        footer={
          <>
            <Btn
              loading={reply.pending}
              disabled={note.trim().length < 10}
              onClick={() => void reply.run()}
            >
              Envoyer
            </Btn>
            <Btn variant="o" disabled={reply.pending} onClick={() => setOpen(false)}>
              Annuler
            </Btn>
          </>
        }
      >
        <label htmlFor={`ticket-${ticketId}`} className="mb-1.5 block text-[13.5px] font-bold text-ink">
          Réponse
        </label>
        <textarea
          id={`ticket-${ticketId}`}
          rows={4}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
      </Modal>
    </>
  );
}
