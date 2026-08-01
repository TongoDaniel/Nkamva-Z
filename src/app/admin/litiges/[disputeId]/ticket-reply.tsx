"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";

/** Réponse de la modération aux éléments apportés par un formateur. */
export function TicketReply({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function onSubmit() {
    setPending(true);
    try {
      await api.post(`/api/admin/disputes/tickets/${ticketId}/resolve`, {
        resolutionNote: note.trim(),
      });
      toast.success("Réponse transmise au formateur.");
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'envoi a échoué.");
    } finally {
      setPending(false);
    }
  }

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
            <Btn loading={pending} disabled={note.trim().length < 10} onClick={onSubmit}>
              Envoyer
            </Btn>
            <Btn variant="o" onClick={() => setOpen(false)}>
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
