"use client";

import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/nk/video-player";
import { toast } from "sonner";
import { useSessionTimeZone } from "@/hooks/use-reader-time-zone";
import { api, ApiError } from "@/lib/client";
import type { ReplayView, ReplayMessage } from "@/lib/lives";
import { ReplayChat } from "./replay-chat";
import { ReplayNotes } from "./replay-notes";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export function ReplayPlayer({
  replay,
  messages,
}: {
  replay: ReplayView;
  /** Le salon de la séance, rattaché au replay (F6.7). */
  messages: ReplayMessage[];
}) {
  const player = React.useRef<VideoPlayerHandle | null>(null);
  const [duration, setDuration] = React.useState(replay.durationSeconds);
  // Arbitrage 94 — la même séance en audio seul, ~60 Mo pour deux heures contre
  // ~1,3 Go. Sur les connexions que sert la plateforme, c'est la différence
  // entre écouter le replay et ne jamais le charger.
  // Modèle v1.1 : les replays du lancement, et ceux du plan Découverte, sont
  // enregistrés en audio seul. Il n'y a alors pas de vidéo à proposer.
  const [variant, setVariant] = React.useState<"video" | "audio">(
    replay.hasVideo ? "video" : "audio",
  );
  // L'adresse signée, avec la variante qu'elle sert. L'attente se **déduit** :
  // tant que l'adresse en main n'est pas celle de la variante demandée, on
  // charge. Un état « chargement » posé dans l'effet doublait cette lecture.
  const [loaded, setLoaded] = React.useState<{ variant: "video" | "audio"; url: string } | null>(
    null,
  );
  const [unavailable, setUnavailable] = React.useState(!replay.downloadable);
  const url = loaded?.variant === variant ? loaded.url : null;
  // La date d'enregistrement est celle du live : sans fuseau, le serveur
  // l'écrivait dans le sien, et une séance du soir à Toronto changeait de jour
  // à l'hydratation. Même règle que `ReplayRow`, sans rappel de l'heure de
  // l'animateur — le lecteur n'affiche que le jour.
  const { timeZone } = useSessionTimeZone(replay.timeZone);

  // L'URL signée est demandée à l'ouverture : elle expire, et l'inscrire dans
  // le HTML rendu par le serveur la ferait fuiter dans le cache.
  React.useEffect(() => {
    if (!replay.downloadable) return;
    let alive = true;
    api
      .get<{ url: string }>(`/api/replays/${replay.id}?lecture=1&variante=${variant}`)
      .then(({ data }) => {
        if (alive) setLoaded({ variant, url: data.url });
      })
      .catch((err) => {
        if (!alive) return;
        setUnavailable(true);
        if (!(err instanceof ApiError && err.code === "REPLAY_UNAVAILABLE")) {
          toast.error("L'enregistrement n'a pas pu être chargé.");
        }
      });
    return () => {
      alive = false;
    };
  }, [replay.id, replay.downloadable, variant]);

  const audio = variant === "audio";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <section className="min-w-0">
        {/* Le lecteur commun (`nk/video-player.tsx`), le même que pour un
            cours : plein écran, saut de dix secondes, clavier, et la position
            retenue par ce navigateur d'une visite à l'autre. */}
        <VideoPlayer
          // Une clé par variante : passer de la vidéo à l'audio change de
          // fichier, et le lecteur repart de la position retenue.
          key={variant}
          controller={player}
          src={url}
          status={unavailable ? "unavailable" : url ? "ready" : "loading"}
          title={replay.title}
          badge="Replay"
          audioOnly={audio}
          audioNote={
            replay.hasVideo
              ? {
                  title: "Version audio seule",
                  body: "L'image n'est pas chargée, seule la parole l'est.",
                }
              : {
                  title: "Replay audio",
                  body: "Cette séance a été enregistrée en audio : il n'y a pas d'image.",
                }
          }
          knownDuration={replay.durationSeconds}
          resumeKey={`replay.${replay.id}`}
          loadingLabel={replay.hasVideo && !audio ? "Chargement de la vidéo…" : "Chargement de l'audio…"}
          unavailableLabel="L'enregistrement de cette séance n'est pas disponible."
          onDuration={setDuration}
          extraControls={
            // Arbitrage 94 — proposé seulement quand la variante existe : les
            // replays antérieurs à la bascule, et ceux hébergés ailleurs, n'en
            // ont pas.
            replay.hasAudioVariant && replay.hasVideo ? (
              <button
                type="button"
                onClick={() => setVariant((v) => (v === "audio" ? "video" : "audio"))}
                aria-pressed={audio}
                className="cursor-pointer rounded-full border border-white/25 px-3 py-1.5 text-[13px] font-bold text-white transition hover:bg-white/15"
              >
                {audio ? "Revenir à la vidéo" : "Audio seul"}
              </button>
            ) : null
          }
        />

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
              <a href={url} download={`${replay.title}.${variant === "audio" ? "ogg" : "mp4"}`}>
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
          durationSeconds={duration}
          onSeek={url ? (seconds) => player.current?.seek(seconds) : undefined}
        />

        {/* Sur le compte, avec repli sur le navigateur (`replay-notes.tsx`). */}
        <ReplayNotes replayId={replay.id} />
      </div>
    </div>
  );
}
