"use client";

import * as React from "react";
import { api } from "@/lib/client";

/**
 * Les notes d'un membre sur un replay — revue du 16 novembre 2026.
 * ==========================================================================
 * Gardées sur le compte (`/api/replays/[id]/notes`), donc retrouvées sur
 * n'importe quel appareil. Elles vivaient d'abord dans l'état de la page
 * (fermer l'onglet les effaçait), puis dans le navigateur.
 *
 * Deux replis, pour ne jamais perdre ce qui a été tapé :
 *
 * - **Le compte ne répond pas** (réseau coupé, ou base pas encore migrée) :
 *   l'écran retombe sur le navigateur, et le dit.
 * - **Des notes laissées dans le navigateur** avant cette version : reprises
 *   et enregistrées sur le compte à la première visite, si le compte n'en a
 *   pas déjà. Elles ne sont effacées du navigateur qu'une fois enregistrées.
 *
 * L'enregistrement part une seconde après la dernière frappe, et tout de suite
 * en quittant le champ ou la page.
 * ==========================================================================
 */

const LOCAL_PREFIX = "nk.replay.notes.";
const SAVE_DELAY = 1_200;

type Mode = "loading" | "account" | "local";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readLocal(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocal(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Sans stockage, rien à faire de plus.
  }
}

export function ReplayNotes({ replayId }: { replayId: string }) {
  const field = React.useRef<HTMLTextAreaElement>(null);
  const timer = React.useRef<number | null>(null);
  const lastSaved = React.useRef<string>("");
  const [mode, setMode] = React.useState<Mode>("loading");
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const localKey = LOCAL_PREFIX + replayId;

  const save = React.useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const body = field.current?.value ?? "";
    if (body === lastSaved.current) return;
    setSaveState("saving");
    try {
      const { data } = await api.patch<{ updatedAt: string | null }>(
        `/api/replays/${replayId}/notes`,
        { body },
      );
      lastSaved.current = body;
      writeLocal(localKey, "");
      setSavedAt(data.updatedAt ? new Date(data.updatedAt) : null);
      setSaveState("saved");
    } catch {
      // Le compte n'a pas pris la note : elle reste au moins dans le navigateur.
      writeLocal(localKey, body);
      setSaveState("failed");
    }
  }, [replayId, localKey]);

  React.useEffect(() => {
    let alive = true;
    api
      .get<{ body: string; updatedAt: string | null }>(`/api/replays/${replayId}/notes`)
      .then(({ data }) => {
        if (!alive || !field.current) return;
        const local = readLocal(localKey);
        lastSaved.current = data.body;
        setSavedAt(data.updatedAt ? new Date(data.updatedAt) : null);
        setMode("account");
        if (data.body) {
          field.current.value = data.body;
        } else if (local) {
          // Les notes d'avant : reprises, puis envoyées au compte.
          field.current.value = local;
          void save();
        }
      })
      .catch(() => {
        if (!alive || !field.current) return;
        field.current.value = readLocal(localKey);
        setMode("local");
      });
    return () => {
      alive = false;
    };
  }, [replayId, localKey, save]);

  // En quittant la page, ce qui n'est pas encore parti part.
  React.useEffect(() => {
    if (mode !== "account") return;
    const flush = () => {
      if ((field.current?.value ?? "") !== lastSaved.current) void save();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [mode, save]);

  function onChange(value: string) {
    if (mode === "local") {
      writeLocal(localKey, value);
      return;
    }
    if (mode !== "account") return;
    setSaveState("idle");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), SAVE_DELAY);
  }

  const status =
    mode === "loading"
      ? "Chargement de vos notes…"
      : mode === "local"
        ? "Vos notes n'ont pas pu être reliées à votre compte : elles sont gardées par ce navigateur, sur cet appareil."
        : saveState === "saving"
          ? "Enregistrement…"
          : saveState === "failed"
            ? "Pas encore enregistrées sur votre compte : gardées sur cet appareil, nouvel essai à la prochaine frappe."
            : savedAt
              ? `Enregistrées sur votre compte à ${new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(savedAt)}. Elles ne sont visibles que de vous.`
              : "Enregistrées sur votre compte au fil de la frappe. Elles ne sont visibles que de vous.";

  return (
    <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
      <label htmlFor="replay-notes" className="mb-2 block text-[15px] font-bold">
        Vos notes
      </label>
      <textarea
        ref={field}
        id="replay-notes"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (mode === "account") void save();
        }}
        disabled={mode === "loading"}
        rows={9}
        maxLength={20_000}
        placeholder="Un passage à revoir, une idée à appliquer…"
        className="w-full resize-y rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[14.5px] leading-relaxed outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25 disabled:opacity-60"
      />
      <p className="mt-2 text-[13px] text-ink-3" role="status">
        {status}
      </p>
    </section>
  );
}
