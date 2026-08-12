"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { AttachmentPicker, type Attachment } from "@/components/nk/attachment-picker";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

export function ReplyForm({ disputeId }: { disputeId: string }) {
  const [body, setBody] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);

  const send = useAction(
    (text: string) =>
      api.post(`/api/me/disputes/${disputeId}/messages`, {
        body: text,
        ...(attachments.length ? { attachments: attachments.map((a) => a.s3Key) } : {}),
      }),
    {
      // Le message apparaît dans le fil rafraîchi : l'annoncer en plus ferait
      // doublon avec ce que l'écran montre déjà.
      success: null,
      error: "L'envoi a échoué.",
      // Vidés dans la transition : le champ ne se libère qu'au moment où le
      // message apparaît dans le fil.
      onSuccess: () => {
        setBody("");
        setAttachments([]);
      },
    },
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    void send.run(text);
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 border-t border-line-2 pt-5">
      <label htmlFor="dispute-reply" className="mb-1.5 block text-[13.5px] font-bold text-ink">
        Votre réponse
      </label>
      <textarea
        id="dispute-reply"
        rows={3}
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Ajoutez un élément utile au dossier."
        className="mb-4 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
      />

      {/* `disputeId` est fourni ici, contrairement à l'ouverture : la pièce est
          rattachée au litige dès la présignature, puisqu'il existe déjà. */}
      <AttachmentPicker value={attachments} onChange={setAttachments} disputeId={disputeId} />

      <div className="flex justify-end">
        <Btn type="submit" loading={send.pending} disabled={!body.trim()}>
          <Send aria-hidden="true" />
          Envoyer
        </Btn>
      </div>
    </form>
  );
}
