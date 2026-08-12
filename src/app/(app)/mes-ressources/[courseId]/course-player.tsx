"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { BtnLink } from "@/components/nk/button-link";
import { ProgressRing } from "@/components/nk/progress-ring";
import { api, ApiError } from "@/lib/client";
import { fmtDuration } from "@/lib/format";

/** Fréquence d'envoi de la progression. CourseView alimente la règle des 30 %. */
const PROGRESS_INTERVAL_MS = 15_000;

export function CoursePlayer({
  courseId,
  format,
  durationSeconds,
  startAtSeconds,
}: {
  courseId: string;
  format: string;
  durationSeconds: number | null;
  startAtSeconds: number;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const lastSent = React.useRef(startAtSeconds);
  const currentRef = React.useRef(startAtSeconds);

  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [watched, setWatched] = React.useState(startAtSeconds);

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<{ url: string }>(`/api/me/resources/${courseId}/content`)
      .then(({ data }) => {
        if (!cancelled) setUrl(data.url);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Le contenu n'a pas pu être chargé.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const sendProgress = React.useCallback(
    async (seconds: number) => {
      const value = Math.floor(seconds);
      // Le backend ne conserve que le maximum : inutile de renvoyer un recul.
      if (value <= lastSent.current) return;
      lastSent.current = value;
      try {
        await api.post(`/api/me/resources/${courseId}/progress`, { watchedSeconds: value });
      } catch {
        // Une progression perdue se rattrape au prochain envoi : pas d'alerte.
      }
    },
    [courseId],
  );

  React.useEffect(() => {
    const id = setInterval(() => void sendProgress(currentRef.current), PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(id);
      void sendProgress(currentRef.current);
    };
  }, [sendProgress]);

  // Un onglet fermé ou masqué ne doit pas perdre la position atteinte.
  React.useEffect(() => {
    const flush = () => void sendProgress(currentRef.current);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [sendProgress]);

  const percent =
    durationSeconds && durationSeconds > 0
      ? Math.min(100, Math.round((watched / durationSeconds) * 100))
      : 0;

  if (error) {
    return (
      <div className="rounded-nk-lg border border-line bg-card p-8 text-center shadow-nk-sm">
        <AlertTriangle className="mx-auto mb-4 size-8 text-gold-ink" aria-hidden="true" />
        <h2 className="mb-2 text-lg font-extrabold">Lecture indisponible</h2>
        <p className="mx-auto mb-6 max-w-[46ch] text-ink-2">{error}</p>
        <BtnLink href="/mes-ressources" variant="o">Retour à mes ressources</BtnLink>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-nk-lg bg-[#0a121f] shadow-nk">
        {url ? (
          <video
            ref={videoRef}
            src={url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-black"
            onLoadedMetadata={() => {
              if (videoRef.current && startAtSeconds > 0) {
                videoRef.current.currentTime = startAtSeconds;
              }
            }}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              currentRef.current = t;
              setWatched((prev) => (t > prev ? t : prev));
            }}
            onPause={() => void sendProgress(currentRef.current)}
            onEnded={() => void sendProgress(durationSeconds ?? currentRef.current)}
          >
            <track kind="captions" />
          </video>
        ) : (
          <div className="grid aspect-video place-items-center text-[#7d8bab]">
            <Loader2 className="size-8 animate-spin" aria-hidden="true" />
            <span className="sr-only">Chargement du contenu…</span>
          </div>
        )}
      </div>

      <aside
        aria-label="Progression"
        className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
      >
        <h2 className="mb-4 text-base font-extrabold">Votre progression</h2>
        <div className="flex items-center gap-4">
          <ProgressRing percent={percent} />
          <p className="text-sm text-ink-2">
            <b className="block text-ink">{fmtDuration(Math.floor(watched)) ?? "0 min"}</b>
            {durationSeconds ? `sur ${fmtDuration(durationSeconds)}` : "consultées"}
          </p>
        </div>
        <p className="mt-5 text-[12.5px] leading-relaxed text-ink-3">
          Votre position est enregistrée automatiquement. Vous reprendrez ici à votre prochaine
          visite, sur n&apos;importe quel appareil.
        </p>
        <BtnLink href="/mes-ressources" variant="o" size="sm" block className="mt-5">
          Retour à mes ressources
        </BtnLink>
        {format !== "video" ? (
          <p className="mt-4 text-[12.5px] text-ink-3">
            Format « {format} » : si la lecture intégrée ne convient pas, téléchargez la ressource
            depuis la liste.
          </p>
        ) : null}
      </aside>
    </div>
  );
}
