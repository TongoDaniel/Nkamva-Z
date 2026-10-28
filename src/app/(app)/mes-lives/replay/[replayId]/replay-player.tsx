"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Gauge, Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { toast } from "sonner";
import { useSessionTimeZone } from "@/hooks/use-reader-time-zone";
import { api, ApiError } from "@/lib/client";
import type { ReplayView, ReplayMessage } from "@/lib/lives";
import { ReplayChat } from "./replay-chat";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function ReplayPlayer({
  replay,
  messages,
}: {
  replay: ReplayView;
  /** Le salon de la séance, rattaché au replay (F6.7). */
  messages: ReplayMessage[];
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [duration, setDuration] = React.useState(replay.durationSeconds);
  const [muted, setMuted] = React.useState(false);
  const [speed, setSpeed] = React.useState<number>(1);
  const [notes, setNotes] = React.useState("");
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(replay.downloadable);
  const [unavailable, setUnavailable] = React.useState(!replay.downloadable);
  // Arbitrage 94 — la même séance en audio seul, ~60 Mo pour deux heures contre
  // ~1,3 Go. Sur les connexions que sert la plateforme, c'est la différence
  // entre écouter le replay et ne jamais le charger.
  const [variant, setVariant] = React.useState<"video" | "audio">("video");
  // La date d'enregistrement est celle du live : sans fuseau, le serveur
  // l'écrivait dans le sien, et une séance du soir à Toronto changeait de jour
  // à l'hydratation. Même règle que `ReplayRow`, sans rappel de l'heure de
  // l'animateur — le lecteur n'affiche que le jour.
  const { timeZone } = useSessionTimeZone(replay.timeZone);

  // L'URL est signée et expire : on la demande à l'ouverture de l'écran plutôt
  // que de la rendre avec la page, où elle traînerait dans le HTML.
  React.useEffect(() => {
    if (!replay.downloadable) return;
    let alive = true;
    setLoading(true);
    api
      .get<{ url: string }>(`/api/replays/${replay.id}?lecture=1&variante=${variant}`)
      .then(({ data }) => {
        if (alive) setUrl(data.url);
      })
      .catch((err) => {
        if (!alive) return;
        setUnavailable(true);
        if (!(err instanceof ApiError && err.code === "REPLAY_UNAVAILABLE")) {
          toast.error("L'enregistrement n'a pas pu être chargé.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [replay.id, replay.downloadable, variant]);

  // La vitesse et le son se posent sur l'élément : c'est lui qui lit, il n'y a
  // plus de progression simulée à tenir en parallèle.
  React.useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, url]);

  React.useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function seek(seconds: number) {
    setPosition(seconds);
    if (videoRef.current) videoRef.current.currentTime = seconds;
  }

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <section className="min-w-0">
        <div className="overflow-hidden rounded-nk-lg bg-navy shadow-nk">
          <div className="relative grid aspect-video place-items-center bg-navy-2 text-center">
            <span className="absolute left-4 top-4 z-[2] rounded-md bg-black/55 px-2 py-1 text-[13px] font-bold uppercase leading-none tracking-[0.08em] text-white">
              Replay
            </span>
            {url && variant === "audio" ? (
              <div className="w-full px-6">
                <p className="text-[13.5px] font-bold text-white">Version audio seule</p>
                <p className="mt-1 text-[13px] text-[#b9c9dd]">
                  L&apos;image n&apos;est pas chargée — seule la parole l&apos;est.
                </p>
              </div>
            ) : null}
            {url ? (
              <video
                ref={videoRef}
                src={url}
                className={variant === "audio" ? "sr-only" : "size-full"}
                playsInline
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  if (Number.isFinite(e.currentTarget.duration)) {
                    setDuration(e.currentTarget.duration);
                  }
                }}
              />
            ) : (
              <div className="px-6">
                {loading ? (
                  <>
                    <Loader2 className="mx-auto size-8 animate-spin text-white" aria-hidden="true" />
                    <p className="mt-4 text-[13.5px] text-[#b9c9dd]">Chargement de la vidéo…</p>
                  </>
                ) : (
                  <p className="text-[13.5px] leading-relaxed text-[#b9c9dd]">
                    {unavailable
                      ? "L'enregistrement de cette séance n'est pas disponible."
                      : "La vidéo n'a pas pu être ouverte."}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="px-5 py-4">
            <label htmlFor="replay-position" className="sr-only">
              Position dans le replay
            </label>
            <input
              id="replay-position"
              type="range"
              min={0}
              max={Math.max(1, Math.round(duration))}
              step={1}
              value={Math.round(position)}
              onChange={(e) => seek(Number(e.target.value))}
              disabled={!url}
              className="w-full accent-brand"
              style={{ colorScheme: "dark" }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggle}
                disabled={!url}
                aria-label={playing ? "Mettre en pause" : "Lancer la lecture"}
                className="grid size-9 cursor-pointer place-items-center rounded-full border border-white/25 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-[17px]"
              >
                {playing ? <Pause /> : <Play />}
              </button>
              <span className="font-display text-[13px] font-bold tabular-nums text-white">
                {clock(position)} <span className="text-[#b9c9dd]">/ {clock(duration)}</span>
              </span>
              <span className="sr-only" aria-live="off">
                {Math.round(progress)} %
              </span>

              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-pressed={muted}
                aria-label={muted ? "Réactiver le son" : "Couper le son"}
                className="ml-auto grid size-9 cursor-pointer place-items-center rounded-full border border-white/25 text-white transition hover:bg-white/15 [&_svg]:size-[17px]"
              >
                {muted ? <VolumeX /> : <Volume2 />}
              </button>

              {/* Arbitrage 94 — proposé seulement quand la variante existe :
                  les replays antérieurs à la bascule, et ceux hébergés
                  ailleurs, n'en ont pas. */}
              {replay.hasAudioVariant ? (
                <button
                  type="button"
                  onClick={() => setVariant((v) => (v === "audio" ? "video" : "audio"))}
                  aria-pressed={variant === "audio"}
                  className="cursor-pointer rounded-full border border-white/25 px-3 py-1.5 text-[13px] font-bold text-white transition hover:bg-white/15"
                >
                  {variant === "audio" ? "Revenir à la vidéo" : "Audio seul"}
                </button>
              ) : null}

              <div className="flex items-center gap-1.5 rounded-full border border-white/25 px-2.5 py-1.5">
                <Gauge className="size-4 text-[#b9c9dd]" aria-hidden="true" />
                <label htmlFor="replay-vitesse" className="sr-only">
                  Vitesse de lecture
                </label>
                <select
                  id="replay-vitesse"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="cursor-pointer bg-transparent text-[13px] font-bold text-white outline-none"
                >
                  {SPEEDS.map((s) => (
                    <option key={s} value={s} className="text-ink">
                      {s.toLocaleString("fr-FR")}×
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
          <h1 className="text-[21px] font-extrabold">{replay.title}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            <Link
              href={routes.community(replay.community.slug)}
              className="font-bold text-brand hover:text-brand-dark"
            >
              {replay.community.name}
            </Link>{" "}
            · enregistré le{" "}
            {new Intl.DateTimeFormat("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone,
            }).format(replay.recordedAt)}
          </p>
          {replay.description ? (
            <p className="mt-4 text-[15px] leading-relaxed text-ink-2 text-pretty">
              {replay.description}
            </p>
          ) : null}

          <div className="mt-5 flex items-center gap-3.5 border-t border-line-2 pt-5">
            <Avatar name={replay.host.name} src={replay.host.avatarUrl} size="lg" alt={`Photo de ${replay.host.name}`} />
            <div className="min-w-0">
              <b className="block text-[15.5px] font-extrabold">{replay.host.name}</b>
              <small className="block text-[13px] text-ink-2">{replay.host.role}</small>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
          <h2 className="mb-1.5 text-[15px] font-bold">Télécharger</h2>
          {/* Arbitrage 43 requalifié par 55 : les deux cadences ayant des droits
              identiques, aucune ne refuse le téléchargement — il est devenu un
              droit uniforme de tout membre. Il n'y a pas de case par séance, et
              il ne faut pas en ajouter. */}
          <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
            {unavailable
              ? "L'enregistrement de cette séance n'est pas disponible."
              : "Le fichier est à vous : tout membre de la communauté peut le télécharger."}
          </p>
          {url ? (
            <Btn asChild variant="o" block>
              <a href={url} download={`${replay.title}.mp4`}>
                <Download aria-hidden="true" />
                Télécharger le replay
              </a>
            </Btn>
          ) : (
            <Btn variant="o" block disabled>
              <Download aria-hidden="true" />
              Télécharger le replay
            </Btn>
          )}
        </section>

        {/*
          Le salon passe avant les notes : c'est ce qu'on vient chercher en
          rouvrant un replay — une question posée ce jour-là, une réponse de
          l'animateur —, et il sert à retrouver le passage.
        */}
        <ReplayChat
          messages={messages}
          onSeek={
            url
              ? (seconds) => {
                  const video = videoRef.current;
                  if (!video) return;
                  video.currentTime = seconds;
                  void video.play().catch(() => {
                    // Lecture refusée par le navigateur : la position est posée
                    // quand même, la personne appuiera elle-même.
                  });
                }
              : undefined
          }
        />

        <section className="rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm">
          <label htmlFor="replay-notes" className="mb-2 block text-[15px] font-bold">
            Vos notes
          </label>
          <textarea
            id="replay-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={9}
            placeholder="Un passage à revoir, une idée à appliquer…"
            className="w-full resize-y rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[14.5px] leading-relaxed outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
          />
          <p className="mt-2 text-[13px] text-ink-3">
            Ces notes restent dans cet onglet : elles ne quittent pas votre navigateur.
          </p>
        </section>
      </div>
    </div>
  );
}
