"use client";

import * as React from "react";
import {
  AlertTriangle,
  Gauge,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Le lecteur de la plateforme — un seul, pour les cours et pour les replays.
 * ==========================================================================
 * Revue du 16 novembre 2026. Il y en avait deux : les cours passaient par les
 * commandes du navigateur (`<video controls>`), les replays par un lecteur
 * maison. Deux écrans pour le même geste, et aucun des deux n'était complet :
 *
 * - le lecteur natif proposait « Télécharger » dans son menu, sur une vidéo
 *   vendue comme lue en ligne, et changeait d'allure d'un navigateur à l'autre ;
 * - le lecteur maison n'avait ni plein écran, ni saut de dix secondes, ni
 *   clavier, ni reprise, et restait muet quand le fichier ne chargeait pas.
 *
 * Ce qu'il fait, et qui ne se négocie pas depuis l'extérieur :
 *
 * 1. **L'image est le bouton.** Un appui lance ou suspend, deux appuis ouvrent
 *    le plein écran, et un grand bouton central dit qu'on peut appuyer.
 * 2. **Le clavier suit** quand le lecteur a le focus : Espace ou K, les flèches
 *    (10 s, volume), J et L, M, F. Les champs gardent leurs propres touches.
 * 3. **Il dit ce qui se passe** : une roue quand le réseau fait attendre, un
 *    message et « Réessayer » quand le fichier ne vient pas. Un cadre noir
 *    muet se lit comme une panne du site.
 * 4. **Il se souvient** de la vitesse et du volume, par navigateur, et de la
 *    position quand on lui donne une clé (`resumeKey`). Les cours tiennent
 *    leur position sur le compte : ils la passent par `startAt`.
 *
 * Le plein écran reprend la règle de la scène d'un direct (`live-stage.tsx`) :
 * l'API quand elle répond, celle de la balise vidéo sur iPhone, et sinon un
 * plein cadre en CSS. Un bouton sans effet est pire qu'un bouton absent.
 * ==========================================================================
 */

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
const SKIP_SECONDS = 10;
const SPEED_KEY = "nk.lecteur.vitesse";
const VOLUME_KEY = "nk.lecteur.volume";
const POSITION_PREFIX = "nk.lecteur.position.";
/** L'attente au-delà de laquelle une mise en mémoire est tenue pour une panne. */
const STALL_MS = 20_000;
/** En deçà de cette marge avant la fin, on repart du début : la lecture est finie. */
const END_MARGIN = 5;

function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string) {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    // Sans stockage, le réglage ne vaut que pour cette visite. C'est tout.
  }
}

/** « 1:02:07 » ou « 2:07 » — l'heure n'apparaît que lorsqu'il y en a une. */
export function horloge(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Ce que l'écran qui pose le lecteur peut lui demander. */
export interface VideoPlayerHandle {
  /** Emmène la lecture à cette seconde, et la lance si le navigateur l'accepte. */
  seek: (seconds: number, play?: boolean) => void;
}

type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

const ROND =
  "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/25 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-[17px]";

export function VideoPlayer({
  src,
  title,
  status = src ? "ready" : "loading",
  poster,
  badge,
  audioOnly = false,
  audioNote,
  knownDuration,
  startAt = 0,
  resumeKey,
  loadingLabel = "Chargement de la vidéo…",
  unavailableLabel = "Cette vidéo n'est pas disponible.",
  extraControls,
  controller,
  onProgress,
  onPause,
  onEnded,
  onDuration,
  className,
}: {
  /** L'adresse signée du fichier. `null` tant qu'elle n'est pas arrivée. */
  src: string | null;
  /** Ce que le lecteur lit, pour les lecteurs d'écran. */
  title: string;
  /** `unavailable` : il n'y aura pas de fichier, et le lecteur le dit. */
  status?: "loading" | "ready" | "unavailable";
  /** L'image posée avant la première lecture. Sans elle, un cadre noir. */
  poster?: string | null;
  /** Une étiquette en coin : « Replay ». */
  badge?: string;
  /** Le fichier n'a pas d'image, ou on a choisi de ne pas la charger. */
  audioOnly?: boolean;
  audioNote?: { title: string; body: string };
  /** La durée annoncée par la base, affichée avant que le fichier ne réponde. */
  knownDuration?: number | null;
  /** La seconde où reprendre, tenue par l'écran appelant (les cours). */
  startAt?: number;
  /** Donne une mémoire de position par navigateur (les replays). */
  resumeKey?: string;
  loadingLabel?: string;
  unavailableLabel?: string;
  /** Des commandes propres à l'écran, posées avant la vitesse. */
  extraControls?: React.ReactNode;
  controller?: React.RefObject<VideoPlayerHandle | null>;
  onProgress?: (seconds: number) => void;
  onPause?: () => void;
  onEnded?: () => void;
  onDuration?: (seconds: number) => void;
  className?: string;
}) {
  const uid = React.useId();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const savedAt = React.useRef(0);

  const [playing, setPlaying] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [waiting, setWaiting] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [duration, setDuration] = React.useState(knownDuration ?? 0);
  const [speed, setSpeed] = React.useState<number>(1);
  const [volume, setVolume] = React.useState(1);
  const [muted, setMuted] = React.useState(false);
  const [plein, setPlein] = React.useState<"non" | "api" | "cadre">("non");

  const ready = status === "ready" && Boolean(src) && !failed;
  const fullscreen = plein !== "non";

  // Le plein écran natif se quitte aussi par Échap ou par le navigateur :
  // l'état se lit sur le document, jamais sur ce qu'on a demandé.
  React.useEffect(() => {
    const sync = () => {
      if (document.fullscreenElement === frameRef.current) setPlein("api");
      else setPlein((current) => (current === "api" ? "non" : current));
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  React.useEffect(() => {
    if (plein !== "cadre") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlein("non");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plein]);

  // Un fichier qui ne répond pas ne lève aucune erreur : la connexion reste
  // ouverte et la roue tourne sans fin. Passé ce délai sans une image, on le
  // dit, et « Réessayer » relance la demande.
  React.useEffect(() => {
    if (!waiting) return;
    const id = window.setTimeout(() => setFailed(true), STALL_MS);
    return () => window.clearTimeout(id);
  }, [waiting]);

  // La position d'un replay, écrite en quittant la page : la dernière écriture
  // périodique peut dater de cinq secondes.
  React.useEffect(() => {
    if (!resumeKey) return;
    const video = videoRef.current;
    return () => {
      if (video && video.currentTime > 0) {
        ecrire(POSITION_PREFIX + resumeKey, String(Math.floor(video.currentTime)));
      }
    };
  }, [resumeKey, src]);

  const toggle = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        // Lecture refusée par le navigateur : le bouton reste, on réappuiera.
      });
    } else {
      video.pause();
    }
  }, []);

  const seekTo = React.useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const fin = Number.isFinite(video.duration) ? video.duration : seconds;
    const cible = Math.min(Math.max(0, seconds), fin);
    video.currentTime = cible;
    setPosition(cible);
  }, []);

  const skip = React.useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (video) seekTo(video.currentTime + delta);
    },
    [seekTo],
  );

  const applyVolume = React.useCallback((valeur: number) => {
    const video = videoRef.current;
    const borne = Math.min(1, Math.max(0, valeur));
    if (video) {
      video.volume = borne;
      video.muted = borne === 0;
    }
    setVolume(borne);
    setMuted(borne === 0);
    ecrire(VOLUME_KEY, String(borne));
  }, []);

  const toggleMute = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Rouvrir le son d'un volume à zéro ne rendrait rien d'audible.
    if (video.muted && video.volume === 0) {
      applyVolume(0.6);
      return;
    }
    video.muted = !video.muted;
    setMuted(video.muted);
  }, [applyVolume]);

  const applySpeed = React.useCallback((valeur: number) => {
    if (videoRef.current) videoRef.current.playbackRate = valeur;
    setSpeed(valeur);
    ecrire(SPEED_KEY, String(valeur));
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    if (plein === "api") {
      void document.exitFullscreen();
      return;
    }
    if (plein === "cadre") {
      setPlein("non");
      return;
    }
    // Trois issues, dans cet ordre : l'API sur le cadre (les commandes restent
    // les nôtres), celle de la balise vidéo (iPhone, qui ne connaît qu'elle),
    // puis le plein cadre en CSS.
    const repli = () => {
      const video = videoRef.current as IosVideo | null;
      if (video?.webkitEnterFullscreen && !audioOnly) {
        try {
          video.webkitEnterFullscreen();
          return;
        } catch {
          // Refusé : il reste le plein cadre.
        }
      }
      setPlein("cadre");
    };
    try {
      const demande = el.requestFullscreen?.();
      if (!demande) {
        repli();
        return;
      }
      demande.then(() => setPlein("api")).catch(repli);
    } catch {
      repli();
    }
  }, [plein, audioOnly]);

  React.useImperativeHandle(
    controller,
    () => ({
      seek: (seconds, play = true) => {
        seekTo(seconds);
        if (play) {
          void videoRef.current?.play().catch(() => {
            // Refusé : la position est posée, la personne appuiera elle-même.
          });
        }
      },
    }),
    [seekTo],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!ready || event.altKey || event.ctrlKey || event.metaKey) return;
    // Un champ garde ses touches : la barre de position avance déjà aux
    // flèches, et la liste des vitesses se parcourt avec.
    const cible = event.target as HTMLElement;
    if (cible.tagName === "INPUT" || cible.tagName === "SELECT" || cible.tagName === "TEXTAREA") {
      return;
    }
    // Espace sur un bouton l'active déjà : le reprendre ici le ferait deux fois.
    if ((event.key === " " || event.key === "Enter") && cible.tagName === "BUTTON") return;

    switch (event.key) {
      case " ":
      case "k":
      case "K":
        toggle();
        break;
      case "ArrowLeft":
      case "j":
      case "J":
        skip(-SKIP_SECONDS);
        break;
      case "ArrowRight":
      case "l":
      case "L":
        skip(SKIP_SECONDS);
        break;
      case "ArrowUp":
        applyVolume((videoRef.current?.volume ?? volume) + 0.1);
        break;
      case "ArrowDown":
        applyVolume((videoRef.current?.volume ?? volume) - 0.1);
        break;
      case "m":
      case "M":
        toggleMute();
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const fin = Math.max(1, Math.round(duration));
  const silencieux = muted || volume === 0;
  const VolumeIcon = silencieux ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={frameRef}
      role="group"
      aria-label={`Lecteur : ${title}`}
      // Le focus sur le cadre ouvre le clavier sans passer par un bouton.
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        "flex flex-col overflow-hidden bg-navy outline-none focus-visible:ring-[3px] focus-visible:ring-brand/50",
        fullscreen ? "h-full w-full rounded-none" : "rounded-nk-lg shadow-nk",
        plein === "cadre" && "fixed inset-0 z-[100]",
        className,
      )}
    >
      <div
        className={cn(
          "relative grid place-items-center bg-black text-center",
          fullscreen ? "min-h-0 flex-1" : "aspect-video",
          audioOnly && "bg-navy-2",
        )}
      >
        {badge ? (
          <span className="pointer-events-none absolute left-4 top-4 z-[3] rounded-md bg-black/55 px-2 py-1 text-[13px] font-bold uppercase leading-none tracking-[0.08em] text-white">
            {badge}
          </span>
        ) : null}

        {src && !failed ? (
          <video
            ref={videoRef}
            src={src}
            poster={poster ?? undefined}
            playsInline
            preload="metadata"
            // Une vidéo vendue comme lue en ligne ne propose pas son fichier :
            // ni par le menu des commandes natives, ni par le clic droit.
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            onClick={toggle}
            onDoubleClick={toggleFullscreen}
            className={cn(
              audioOnly ? "sr-only" : "size-full cursor-pointer object-contain",
              fullscreen && !audioOnly && "absolute inset-0",
            )}
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              const total = video.duration;
              if (Number.isFinite(total)) {
                setDuration(total);
                onDuration?.(total);
              }
              // Les réglages gardés par ce navigateur. Lus ici, sur un
              // événement, et non au rendu : le serveur ne les connaît pas.
              const vitesse = Number(lire(SPEED_KEY));
              if (SPEEDS.includes(vitesse as (typeof SPEEDS)[number])) {
                video.playbackRate = vitesse;
                setSpeed(vitesse);
              }
              const son = lire(VOLUME_KEY);
              if (son !== null && Number.isFinite(Number(son))) {
                const borne = Math.min(1, Math.max(0, Number(son)));
                video.volume = borne;
                video.muted = borne === 0;
                setVolume(borne);
                setMuted(borne === 0);
              }
              // La position : celle de l'écran appelant d'abord, sinon celle
              // que ce navigateur a retenue. Une lecture finie repart du début.
              const retenue = resumeKey ? Number(lire(POSITION_PREFIX + resumeKey)) : 0;
              const reprise = startAt > 0 ? startAt : Number.isFinite(retenue) ? retenue : 0;
              const terminee = Number.isFinite(total) && reprise >= total - END_MARGIN;
              if (reprise > 0 && !terminee) {
                video.currentTime = reprise;
                setPosition(reprise);
              }
            }}
            onPlay={() => {
              setPlaying(true);
              setStarted(true);
            }}
            onPause={() => {
              setPlaying(false);
              onPause?.();
            }}
            onWaiting={() => setWaiting(true)}
            onPlaying={() => setWaiting(false)}
            onCanPlay={() => setWaiting(false)}
            onEnded={() => {
              setPlaying(false);
              if (resumeKey) ecrire(POSITION_PREFIX + resumeKey, "0");
              onEnded?.();
            }}
            onError={() => setFailed(true)}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              setPosition(t);
              onProgress?.(t);
              if (resumeKey && Math.abs(t - savedAt.current) >= 5) {
                savedAt.current = t;
                ecrire(POSITION_PREFIX + resumeKey, String(Math.floor(t)));
              }
            }}
          >
            <track kind="captions" />
          </video>
        ) : null}

        {ready && audioOnly && audioNote ? (
          <div className="w-full px-6">
            <p className="text-[13.5px] font-bold text-white">{audioNote.title}</p>
            <p className="mt-1 text-[13px] text-[#b9c9dd]">{audioNote.body}</p>
          </div>
        ) : null}

        {/* Le grand bouton : tant que rien ne joue et que rien ne charge. */}
        {ready && !playing && !waiting && !audioOnly ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={started ? "Reprendre la lecture" : "Lancer la lecture"}
            className="absolute z-[2] grid size-[68px] cursor-pointer place-items-center rounded-full bg-white/95 text-navy shadow-nk-lg transition hover:scale-105 hover:bg-white [&_svg]:size-7"
          >
            <Play className="translate-x-0.5 fill-current" aria-hidden="true" />
          </button>
        ) : null}

        {ready && waiting ? (
          <div className="pointer-events-none absolute z-[2] grid size-[68px] place-items-center rounded-full bg-black/55">
            <Loader2 className="size-8 animate-spin text-white" aria-hidden="true" />
            <span className="sr-only" role="status">
              Mise en mémoire…
            </span>
          </div>
        ) : null}

        {!ready ? (
          <div className="px-6">
            {failed ? (
              <>
                <AlertTriangle className="mx-auto size-8 text-[#ffd9d1]" aria-hidden="true" />
                <p className="mt-3 text-[14px] font-bold text-white" role="alert">
                  La lecture a été interrompue.
                </p>
                <p className="mx-auto mt-1 max-w-[42ch] text-[13.5px] leading-relaxed text-[#b9c9dd]">
                  Le fichier n&apos;a pas pu être lu. Vérifiez votre connexion, puis réessayez.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFailed(false);
                    setWaiting(false);
                  }}
                  className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-[13.5px] font-bold text-white transition hover:bg-white/15"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Réessayer
                </button>
              </>
            ) : status === "unavailable" ? (
              <p className="text-[13.5px] leading-relaxed text-[#b9c9dd]">{unavailableLabel}</p>
            ) : (
              <>
                <Loader2 className="mx-auto size-8 animate-spin text-white" aria-hidden="true" />
                <p className="mt-4 text-[13.5px] text-[#b9c9dd]" role="status">
                  {loadingLabel}
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 px-4 pb-3.5 pt-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="w-[4.2ch] shrink-0 text-right font-display text-[13px] font-bold tabular-nums text-white sm:w-auto">
            {horloge(position)}
          </span>
          <label className="sr-only" htmlFor={`position-${uid}`}>
            Position dans la lecture
          </label>
          <input
            id={`position-${uid}`}
            type="range"
            min={0}
            max={fin}
            step={1}
            value={Math.min(fin, Math.round(position))}
            onChange={(e) => seekTo(Number(e.target.value))}
            disabled={!ready}
            aria-valuetext={`${horloge(position)} sur ${horloge(duration)}`}
            className="h-5 min-w-0 flex-1 cursor-pointer accent-brand disabled:cursor-not-allowed"
            style={{ colorScheme: "dark" }}
          />
          <span className="shrink-0 font-display text-[13px] font-bold tabular-nums text-[#b9c9dd]">
            {horloge(duration)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            disabled={!ready}
            aria-label={playing ? "Mettre en pause" : "Lancer la lecture"}
            className={ROND}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <button
            type="button"
            onClick={() => skip(-SKIP_SECONDS)}
            disabled={!ready}
            aria-label={`Reculer de ${SKIP_SECONDS} secondes`}
            className={ROND}
          >
            <RotateCcw />
          </button>
          <button
            type="button"
            onClick={() => skip(SKIP_SECONDS)}
            disabled={!ready}
            aria-label={`Avancer de ${SKIP_SECONDS} secondes`}
            className={ROND}
          >
            <RotateCw />
          </button>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                disabled={!ready}
                aria-pressed={silencieux}
                aria-label={silencieux ? "Réactiver le son" : "Couper le son"}
                className={ROND}
              >
                <VolumeIcon />
              </button>
              {/* Le curseur à partir de `sm` : un téléphone a ses boutons de
                  volume, et la place y manque. */}
              <label className="sr-only" htmlFor={`volume-${uid}`}>
                Volume
              </label>
              <input
                id={`volume-${uid}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={silencieux ? 0 : volume}
                onChange={(e) => applyVolume(Number(e.target.value))}
                disabled={!ready}
                className="hidden w-20 cursor-pointer accent-brand sm:block"
                style={{ colorScheme: "dark" }}
              />
            </div>

            {extraControls}

            <div className="flex items-center gap-1.5 rounded-full border border-white/25 px-2.5 py-1.5">
              <Gauge className="size-4 text-[#b9c9dd]" aria-hidden="true" />
              <label htmlFor={`vitesse-${uid}`} className="sr-only">
                Vitesse de lecture
              </label>
              <select
                id={`vitesse-${uid}`}
                value={speed}
                onChange={(e) => applySpeed(Number(e.target.value))}
                className="cursor-pointer bg-transparent text-[13px] font-bold text-white outline-none"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s} className="text-ink">
                    {s.toLocaleString("fr-FR")}×
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              disabled={!ready || audioOnly}
              aria-pressed={fullscreen}
              aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
              className={ROND}
            >
              {fullscreen ? <Minimize /> : <Maximize />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
