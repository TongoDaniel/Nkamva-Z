"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { useAction } from "@/hooks/use-action";
import { api, ApiError } from "@/lib/client";

/**
 * Programmer une séance. Le formulaire pose `noValidate` comme tous les autres
 * du projet : les messages du navigateur dépendent de sa langue et ne
 * correspondent pas aux règles du serveur.
 *
 * Deux points d'entrée le rendent : l'agenda `/mes-lives`, où il est l'action
 * principale de l'écran et doit dire dans quelle communauté la séance atterrit,
 * et le salon « Sessions » d'une communauté, où ce choix n'existe pas — la page
 * *est* la communauté. `inCommunity` porte cette différence ; le reste du
 * formulaire, ses règles et son rafraîchissement sont les mêmes des deux côtés.
 */
export function ScheduleLive({
  communities,
  inCommunity = false,
}: {
  communities: Array<{ id: string; name: string }>;
  /**
   * Ouvert depuis le salon d'une communauté : bouton discret, et pas de
   * sélecteur de communauté. `communities` ne porte alors que celle du salon.
   */
  inCommunity?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [communityId, setCommunityId] = React.useState(communities[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [duration, setDuration] = React.useState(60);

  // Déclaré avant le retour anticipé ci-dessous : un hook ne peut pas vivre
  // derrière une condition.
  const schedule = useAction(
    (when: Date) =>
      api.post("/api/lives", {
        communityId,
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledStartAt: when.toISOString(),
        durationMinutes: duration,
        // Arbitrage 107 — l'heure part en UTC, le fuseau dit dans lequel elle a
        // été pensée. Un membre de la diaspora verra l'heure chez lui *et* la
        // mention « 18 h 00 à Douala », au lieu de deviner laquelle fait foi.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    {
      success: "Séance programmée. Les membres en sont prévenus.",
      // L'échec s'affiche dans la modale, à côté des champs : pas de toast.
      error: null,
      onSuccess: () => {
        setOpen(false);
        setTitle("");
        setDescription("");
        setStartsAt("");
      },
      onError: (err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "La séance n'a pas pu être programmée. Réessayez.",
        ),
    },
  );

  // Un live appartient à une communauté (arbitrage 32). Sans communauté ouverte
  // aux sessions, il n'y a rien à programmer — le dire vaut mieux qu'un
  // formulaire qui refuserait à l'envoi.
  if (communities.length === 0) {
    return (
      <p className="max-w-[38ch] text-[13px] leading-relaxed text-ink-2">
        Activez les sessions live sur une de vos communautés pour pouvoir en programmer.
      </p>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) return setError("Donnez un titre à la séance.");
    if (!startsAt) return setError("Choisissez une date et une heure de début.");
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) return setError("Cette date n'est pas valide.");
    if (when.getTime() < Date.now()) return setError("Une séance ne se programme pas dans le passé.");

    void schedule.run(when);
  }

  const field =
    "w-full rounded-nk border border-line bg-paper px-3.5 py-2.5 text-[14.5px] outline-none focus-visible:border-brand";

  return (
    <>
      <Btn
        onClick={() => setOpen(true)}
        variant={inCommunity ? "o" : "p"}
        size={inCommunity ? "sm" : undefined}
      >
        <CalendarPlus aria-hidden="true" />
        Programmer une séance
      </Btn>

      <Modal open={open} onOpenChange={setOpen} title="Programmer une séance">
        <form onSubmit={submit} noValidate className="grid gap-4">
          {error ? (
            <p role="alert" className="rounded-nk-sm bg-danger-tint px-3.5 py-2.5 text-[13.5px] text-danger">
              {error}
            </p>
          ) : null}

          {inCommunity ? null : (
            <label className="grid gap-1.5">
              <span className="text-[13px] font-bold">Communauté</span>
              <select
                value={communityId}
                onChange={(e) => setCommunityId(e.target.value)}
                className={field}
              >
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="grid gap-1.5">
            <span className="text-[13px] font-bold">Titre</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Revue de checklists QA"
              className={field}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-bold">
              Description <span className="font-normal text-ink-3">(facultatif)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Ce que vous comptez y faire."
              className={`${field} resize-y`}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-bold">Début</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={field}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-bold">Durée (min)</span>
              <input
                type="number"
                min={5}
                max={480}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={field}
              />
            </label>
          </div>

          <p className="text-[13px] leading-relaxed text-ink-3">
            La séance sera enregistrée automatiquement : vous n&apos;avez rien à déclencher, et il
            n&apos;y a pas de case à cocher. Le replay portera la date de la session.
          </p>

          <div className="flex justify-end gap-2">
            <Btn type="button" variant="t" onClick={() => setOpen(false)}>
              Annuler
            </Btn>
            <Btn type="submit" loading={schedule.pending}>
              Programmer
            </Btn>
          </div>
        </form>
      </Modal>
    </>
  );
}
