"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/nk/button";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/client";

/**
 * Plan d'action 1.4 et 1.7 : noter un contact (service client) ou un suivi
 * (commercial). Une ligne courte suffit : « appelé, rappelle lundi ».
 */
export function TrainerNoteForm({
  trainerId,
  kind,
  label,
}: {
  trainerId: string;
  kind: "SUPPORT_CONTACT" | "SALES_NOTE";
  label: string;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const save = useAction(
    async () => {
      await api.post(`/api/admin/trainers/${trainerId}/notes`, { kind, body });
      setBody("");
      router.refresh();
    },
    { success: "Noté.", error: "La note n'a pas pu être enregistrée." },
  );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim().length >= 2) void save.run();
      }}
    >
      <label className="sr-only" htmlFor={`note-${kind}-${trainerId}`}>
        {label}
      </label>
      <input
        id={`note-${kind}-${trainerId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={label}
        maxLength={2000}
        className="min-w-0 flex-1 rounded-nk border border-line px-3 py-1.5 text-[13.5px]"
      />
      <Btn size="sm" variant="o" type="submit" loading={save.pending}>
        Noter
      </Btn>
    </form>
  );
}
