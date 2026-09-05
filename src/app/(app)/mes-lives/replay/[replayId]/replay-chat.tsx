"use client";

// ==========================================================================
// Le salon de la séance, rattaché à son replay (F6.7, arbitrage 42)
// ==========================================================================
// Ce salon existait, il était écrit, et le schéma disait explicitement qu'il
// était **conservé pour le replay** — c'est ce qui justifie la colonne de
// retrait par la Modération sur `LiveMessage`. Aucun écran ne le rendait une
// fois la séance finie : ce qui s'était dit pendant deux heures de direct
// disparaissait avec le dernier participant.
//
// Chaque message porte le moment où il a été écrit **dans la séance**, et
// cliquer dessus y emmène la vidéo. C'est ce qui distingue un salon rattaché
// d'un simple journal recopié à côté : il sert à retrouver un passage.

import * as React from "react";
import { MessagesSquare } from "lucide-react";
import type { ReplayMessage } from "@/lib/lives";

function horloge(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function ReplayChat({
  messages,
  onSeek,
}: {
  messages: ReplayMessage[];
  /** Emmène la vidéo à cette seconde. Absent tant que rien n'est lisible. */
  onSeek?: (seconds: number) => void;
}) {
  if (messages.length === 0) {
    return (
      <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold">
          <MessagesSquare className="size-4 text-ink-3" aria-hidden="true" />
          Le salon de la séance
        </h2>
        <p className="text-[13.5px] leading-relaxed text-ink-3">
          Personne n&apos;a écrit pendant ce direct.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold">
        <MessagesSquare className="size-4 text-ink-3" aria-hidden="true" />
        Le salon de la séance
      </h2>
      <p className="mb-3.5 text-[13px] leading-relaxed text-ink-3">
        Ce qui s&apos;est dit pendant le direct. Touchez un horodatage pour y revenir dans
        l&apos;enregistrement.
      </p>

      <ol className="grid max-h-[420px] gap-3 overflow-y-auto overscroll-contain pr-1">
        {messages.map((m) => {
          // Ce qui a été écrit avant l'ouverture de la salle ne se situe pas
          // dans la vidéo : on le dit plutôt que de renvoyer à la seconde zéro.
          const avantLeDirect = m.offsetSeconds < 0;
          return (
            <li key={m.id} className="grid grid-cols-[auto_1fr] items-baseline gap-2.5">
              {avantLeDirect || !onSeek ? (
                <span className="font-display text-[13px] font-semibold text-ink-3">
                  {avantLeDirect ? "avant" : horloge(m.offsetSeconds)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSeek(m.offsetSeconds)}
                  aria-label={`Reprendre la lecture à ${horloge(m.offsetSeconds)}`}
                  className="nk-tap cursor-pointer rounded font-display text-[13px] font-semibold text-brand hover:underline"
                >
                  {horloge(m.offsetSeconds)}
                </button>
              )}
              <p className="min-w-0 text-[13.5px] leading-relaxed text-ink-2">
                <b className="font-semibold text-ink">{m.author}</b>{" "}
                <span className="break-words">{m.body}</span>
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
