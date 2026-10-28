"use client";

// ==========================================================================
// Lecture d'une ressource achetée (F3, « Consultation »)
// ==========================================================================
// Cet écran rendait **tout** dans une balise `<video>`. Quatre des cinq
// ressources de staging étant des PDF ou des kits, l'acheteur obtenait un
// rectangle noir, et rien n'était mesuré : c'est le constat 6 de l'audit.
//
// Chaque format a désormais le rendu qui lui correspond, et **une position
// réelle** :
//
//   · vidéo    → lecteur natif, position en **secondes**
//   · document → visualiseur PDF embarqué, position en **pages**
//   · archive  → téléchargement, et un marqueur « terminé » que l'apprenant
//                pose lui-même : rien ne peut le mesurer à sa place.
//
// La position part au serveur pendant la consultation, et **au plus tard**
// quand l'onglet est masqué ou fermé. Elle est portée par le compte, pas par
// le navigateur : fermer l'onglet, se déconnecter ou changer de téléphone ne
// la perdent pas (F3.4).

import * as React from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, CheckCircle2, Download, Loader2, RotateCcw } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { BtnLink } from "@/components/nk/button-link";
import { ProgressRing } from "@/components/nk/progress-ring";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { fmtDuration } from "@/lib/format";

/**
 * Le visualiseur PDF n'entre dans le paquet que de cette route (arbitrage 122).
 * `ssr: false` : il dessine sur un canevas, il n'a rien à rendre côté serveur.
 */
const PdfReader = dynamic(() => import("./pdf-reader").then((m) => m.PdfReader), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[380px] place-items-center rounded-nk-lg border border-line bg-card">
      <Loader2 className="size-8 animate-spin text-ink-3" aria-hidden="true" />
      <span className="sr-only">Chargement du visualiseur…</span>
    </div>
  ),
});

/** Fréquence d'envoi de la position pendant la consultation. */
const POSITION_INTERVAL_MS = 15_000;

const ARCHIVE_FORMATS = ["kit", "notion", "tableur"];

export function CoursePlayer({
  courseId,
  format,
  durationSeconds,
  pageCount,
  startAtSeconds,
  startAtPage,
  completed,
  downloaded,
}: {
  courseId: string;
  format: string;
  durationSeconds: number | null;
  pageCount: number | null;
  startAtSeconds: number;
  startAtPage: number | null;
  completed: boolean;
  downloaded: boolean;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const isVideo = format === "video";
  const isPdf = format === "pdf";
  const isArchive = ARCHIVE_FORMATS.includes(format);

  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Ce qui est déjà parti, et ce qui attend de partir. Le second est une
  // référence : l'intervalle et les écouteurs de fermeture le lisent sans se
  // réabonner à chaque image de vidéo.
  const envoyeSeconds = React.useRef(startAtSeconds);
  const envoyePage = React.useRef(startAtPage ?? 0);
  const courantSeconds = React.useRef(startAtSeconds);
  const courantPage = React.useRef(startAtPage ?? 1);

  const [watched, setWatched] = React.useState(startAtSeconds);
  const [page, setPage] = React.useState(startAtPage ?? 1);
  const [termine, setTermine] = React.useState(completed);
  const [marquage, setMarquage] = React.useState(false);

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

  /**
   * Envoie la position, et seulement si elle a bougé. Une position perdue se
   * rattrape au prochain envoi : rien n'alerte l'apprenant.
   */
  const envoyer = React.useCallback(async () => {
    const corps: { watchedSeconds?: number; lastPage?: number } = {};

    if (isVideo) {
      const valeur = Math.floor(courantSeconds.current);
      // Le serveur ne garde que le maximum pour une vidéo : renvoyer un recul
      // ne servirait à rien.
      if (valeur <= envoyeSeconds.current) return;
      envoyeSeconds.current = valeur;
      corps.watchedSeconds = valeur;
    } else if (isPdf) {
      const valeur = Math.max(1, Math.floor(courantPage.current));
      // Pour un document, **toute** différence compte, y compris un retour en
      // arrière : c'est là qu'on reprendra.
      if (valeur === envoyePage.current) return;
      envoyePage.current = valeur;
      corps.lastPage = valeur;
    } else {
      return;
    }

    try {
      await api.post(`/api/me/resources/${courseId}/progress`, corps);
    } catch {
      // Sans conséquence : la position repartira au prochain battement.
    }
  }, [courseId, isVideo, isPdf]);

  React.useEffect(() => {
    if (isArchive) return;
    const id = setInterval(() => void envoyer(), POSITION_INTERVAL_MS);
    return () => {
      clearInterval(id);
      void envoyer();
    };
  }, [envoyer, isArchive]);

  // Un onglet fermé ou masqué ne doit pas perdre la position atteinte.
  React.useEffect(() => {
    if (isArchive) return;
    const flush = () => void envoyer();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [envoyer, isArchive]);

  const onPageChange = React.useCallback((numero: number) => {
    courantPage.current = numero;
    setPage(numero);
  }, []);

  /** Le marqueur d'une archive : l'apprenant le pose, et peut le retirer. */
  async function basculerTermine() {
    const cible = !termine;
    setMarquage(true);
    try {
      await api.post(`/api/me/resources/${courseId}/progress`, { completed: cible });
      setTermine(cible);
      toast.success(cible ? "Ressource marquée comme terminée." : "Marqueur retiré.");
    } catch {
      toast.error("Le marqueur n'a pas pu être enregistré. Réessayez.");
    } finally {
      setMarquage(false);
    }
  }

  // --- Progression affichée, dérivée de la position (F3.5) ------------------
  //
  // `null` n'est pas zéro : il dit que la longueur est inconnue. L'anneau
  // affiche alors « commencé » plutôt qu'un 0 % qui ferait croire que rien n'a
  // été enregistré.
  const percent: number | null = isVideo
    ? durationSeconds && durationSeconds > 0
      ? Math.min(100, Math.round((watched / durationSeconds) * 100))
      : watched > 0
        ? null
        : 0
    : isPdf
      ? pageCount && pageCount > 0
        ? Math.min(100, Math.round((page / pageCount) * 100))
        : startAtPage || page > 1
          ? null
          : 0
      : termine || downloaded
        ? 100
        : 0;

  if (error) {
    return (
      <div className="rounded-nk-lg border border-line bg-card p-5 text-center shadow-nk-sm sm:p-8">
        <AlertTriangle className="mx-auto mb-4 size-8 text-gold-ink" aria-hidden="true" />
        <h2 className="mb-2 text-lg font-extrabold">Lecture indisponible</h2>
        <p className="mx-auto mb-6 max-w-[46ch] text-ink-2">{error}</p>
        <BtnLink href="/mes-ressources" variant="o">Retour à mes ressources</BtnLink>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
      <div>
        {isVideo ? (
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
                  courantSeconds.current = t;
                  setWatched((prev) => (t > prev ? t : prev));
                }}
                onPause={() => void envoyer()}
                onEnded={() => {
                  courantSeconds.current = durationSeconds ?? courantSeconds.current;
                  void envoyer();
                }}
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
        ) : null}

        {isPdf ? (
          url ? (
            <PdfReader url={url} startPage={startAtPage ?? 1} onPageChange={onPageChange} />
          ) : (
            <div className="grid min-h-[380px] place-items-center rounded-nk-lg border border-line bg-card">
              <Loader2 className="size-8 animate-spin text-ink-3" aria-hidden="true" />
              <span className="sr-only">Chargement du document…</span>
            </div>
          )
        ) : null}

        {isArchive ? (
          <div className="rounded-nk-lg border border-line bg-card p-5 text-center shadow-nk-sm sm:p-8">
            <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-line bg-card text-brand">
              <Download className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mb-2 text-lg font-extrabold">Ressource à télécharger</h2>
            <p className="mx-auto mb-6 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-2">
              Ce format ne se lit pas dans le navigateur. Téléchargez-le, puis marquez-le comme
              terminé quand vous en aurez fait le tour. C&apos;est vous qui posez ce repère, rien
              ne peut le deviner à votre place.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {url ? (
                <BtnLink href={url} download>
                  <Download aria-hidden="true" />
                  Télécharger la ressource
                </BtnLink>
              ) : (
                <Btn disabled>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Préparation du lien…
                </Btn>
              )}
              <Btn variant="o" onClick={() => void basculerTermine()} loading={marquage}>
                {termine ? (
                  <>
                    <RotateCcw aria-hidden="true" />
                    Retirer « terminé »
                  </>
                ) : (
                  <>
                    <CheckCircle2 aria-hidden="true" />
                    Marquer comme terminée
                  </>
                )}
              </Btn>
            </div>
          </div>
        ) : null}
      </div>

      <aside
        aria-label="Progression"
        className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
      >
        <h2 className="mb-4 text-base font-extrabold">Votre progression</h2>
        <div className="flex items-center gap-4">
          <ProgressRing percent={percent} />
          <p className="text-sm text-ink-2">
            {isVideo ? (
              <>
                <b className="block text-ink">{fmtDuration(Math.floor(watched)) ?? "0 min"}</b>
                {durationSeconds ? `sur ${fmtDuration(durationSeconds)}` : "consultées"}
              </>
            ) : isPdf ? (
              <>
                <b className="block text-ink">Page {page}</b>
                {pageCount ? `sur ${pageCount}` : "atteinte"}
              </>
            ) : (
              <>
                <b className="block text-ink">{termine ? "Terminée" : "En cours"}</b>
                {termine ? "vous l'avez marquée" : "à marquer quand vous aurez fini"}
              </>
            )}
          </p>
        </div>

        <p className="mt-5 text-[13px] leading-relaxed text-ink-3">
          {isArchive
            ? "Votre marqueur est enregistré sur votre compte : vous le retrouverez sur n'importe quel appareil."
            : "Votre position est enregistrée automatiquement. Vous reprendrez ici à votre prochaine visite, sur n'importe quel appareil."}
        </p>

        <BtnLink href="/mes-ressources" variant="o" size="sm" block className="mt-5">
          Retour à mes ressources
        </BtnLink>
      </aside>
    </div>
  );
}
