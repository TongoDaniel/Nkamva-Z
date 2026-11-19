"use client";

import * as React from "react";
import { Camera, CheckCircle2, Mic, Square, Video } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { CAM_DEVICE_KEY, MIC_DEVICE_KEY } from "@/hooks/use-live-room";
import { cn } from "@/lib/utils";

/**
 * Le test d'avant-séance : se voir, s'entendre, choisir son micro.
 * ==========================================================================
 * Revue du 16 novembre 2026. « Ouvrir la séance » lance l'enregistrement et
 * prévient les membres ; jusque-là, l'animateur n'avait aucun moyen de savoir
 * si sa caméra cadrait ou si son micro captait. Il le découvrait en direct,
 * devant tout le monde, et sur le replay.
 *
 * Ce test ne touche pas à la salle : il ouvre le micro et la caméra **dans le
 * navigateur seulement**, rien ne part vers le serveur, et tout se referme à
 * l'arrêt du test ou en quittant l'écran. Ce qu'il laisse, ce sont les
 * périphériques choisis (`MIC_DEVICE_KEY`, `CAM_DEVICE_KEY`), que la salle
 * reprend à la connexion (`use-live-room.ts`).
 *
 * Le navigateur ne demande l'autorisation qu'au clic sur « Lancer le test »,
 * jamais à l'ouverture de la page : une demande de caméra qui surgit sans
 * geste se refuse par réflexe, et un refus ne se rattrape que dans les
 * réglages du navigateur.
 * ==========================================================================
 */

function lire(cle: string): string | undefined {
  try {
    return window.localStorage.getItem(cle) || undefined;
  } catch {
    return undefined;
  }
}

function ecrire(cle: string, valeur: string) {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    // Sans stockage, le choix ne vaut que pour ce test.
  }
}

function messageDeRefus(err: unknown, video: boolean): string {
  const nom = err instanceof Error ? err.name : "";
  if (nom === "NotAllowedError" || nom === "SecurityError") {
    return `Le navigateur a refusé l'accès ${video ? "au micro et à la caméra" : "au micro"}. Autorisez-le depuis le cadenas de la barre d'adresse, puis relancez le test.`;
  }
  if (nom === "NotFoundError" || nom === "OverconstrainedError") {
    return `Aucun ${video ? "micro ou aucune caméra" : "micro"} n'a été trouvé sur cet appareil.`;
  }
  if (nom === "NotReadableError") {
    return "Le micro ou la caméra est déjà utilisé par une autre application. Fermez-la, puis relancez le test.";
  }
  return "Le test n'a pas pu démarrer sur ce navigateur.";
}

type Devices = { micros: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] };

const SELECT =
  "min-w-0 flex-1 cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3 py-2 text-[13.5px] font-semibold text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25";

export function DeviceCheck({
  video = true,
  intro,
  className,
}: {
  /** Faux pour une séance en audio seul : la caméra n'est ni demandée ni montrée. */
  video?: boolean;
  /** La phrase qui dit pourquoi tester, propre à l'écran qui pose le test. */
  intro: string;
  className?: string;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const meterRef = React.useRef<HTMLSpanElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioRef = React.useRef<{ context: AudioContext; frame: number } | null>(null);

  const [running, setRunning] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [heard, setHeard] = React.useState(false);
  const [devices, setDevices] = React.useState<Devices>({ micros: [], cameras: [] });
  const [micro, setMicro] = React.useState<string | undefined>(undefined);
  const [camera, setCamera] = React.useState<string | undefined>(undefined);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioRef.current) {
      window.cancelAnimationFrame(audioRef.current.frame);
      void audioRef.current.context.close().catch(() => {
        // Déjà fermé.
      });
      audioRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
  }, []);

  // Quitter l'écran referme tout : une caméra qui reste allumée après le
  // départ est le genre de chose qu'on ne pardonne pas à un site.
  React.useEffect(() => stop, [stop]);

  const start = React.useCallback(
    async (wanted?: { micro?: string; camera?: string }) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Ce navigateur ne permet pas de tester le micro et la caméra.");
        return;
      }
      setStarting(true);
      setError(null);
      setHeard(false);
      stop();

      const idMicro = wanted?.micro ?? lire(MIC_DEVICE_KEY);
      const idCamera = wanted?.camera ?? lire(CAM_DEVICE_KEY);
      try {
        // Le périphérique retenu est demandé **exactement** : avec `ideal`,
        // Chrome reprenait son micro par défaut et ignorait le choix (essai du
        // 19 novembre 2026). S'il a été débranché depuis, la demande échoue
        // et l'on retombe sur les périphériques par défaut, sans erreur.
        const ask = (exact: boolean) =>
          navigator.mediaDevices.getUserMedia({
            audio: exact && idMicro ? { deviceId: { exact: idMicro } } : true,
            video: video ? (exact && idCamera ? { deviceId: { exact: idCamera } } : true) : false,
          });
        let stream: MediaStream;
        try {
          stream = await ask(Boolean(idMicro || idCamera));
        } catch (err) {
          const nom = err instanceof Error ? err.name : "";
          if (nom !== "OverconstrainedError" && nom !== "NotFoundError") throw err;
          stream = await ask(false);
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        // Les noms des périphériques ne sont lisibles qu'après l'autorisation.
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices({
          micros: all.filter((d) => d.kind === "audioinput" && d.deviceId),
          cameras: all.filter((d) => d.kind === "videoinput" && d.deviceId),
        });
        setMicro(stream.getAudioTracks()[0]?.getSettings().deviceId);
        setCamera(stream.getVideoTracks()[0]?.getSettings().deviceId);

        // Le niveau du micro : écrit dans le style de la barre, image par
        // image, sans passer par l'état — soixante rendus par seconde pour une
        // barre de volume seraient du gaspillage.
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const state = { context, frame: 0 };
        audioRef.current = state;
        const draw = () => {
          analyser.getByteTimeDomainData(samples);
          let peak = 0;
          for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
          const level = Math.min(1, peak / 64);
          if (meterRef.current) meterRef.current.style.width = `${Math.round(level * 100)}%`;
          if (level > 0.25) setHeard(true);
          state.frame = window.requestAnimationFrame(draw);
        };
        draw();

        setRunning(true);
      } catch (err) {
        setError(messageDeRefus(err, video));
      } finally {
        setStarting(false);
      }
    },
    [stop, video],
  );

  function chooseMicro(id: string) {
    ecrire(MIC_DEVICE_KEY, id);
    void start({ micro: id, camera });
  }

  function chooseCamera(id: string) {
    ecrire(CAM_DEVICE_KEY, id);
    void start({ micro, camera: id });
  }

  return (
    <div className={cn("mx-auto w-full max-w-[460px] text-left", className)}>
      {/* La balise reste montée pour que le flux s'y attache dès qu'il arrive ;
          elle ne se montre que pendant le test. */}
      <div
        className={cn(
          "relative mb-4 aspect-video overflow-hidden rounded-nk-lg bg-navy-2",
          (!running || !video) && "hidden",
        )}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Aperçu de votre caméra"
          // En miroir, comme dans une glace : c'est ainsi qu'on se cadre.
          className="size-full -scale-x-100 object-cover"
        />
      </div>

      {running ? (
        <div className="grid gap-3.5">
          <div>
            <p className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-[var(--live-muted)]">
              <Mic className="size-4" aria-hidden="true" />
              {heard ? (
                <span className="inline-flex items-center gap-1.5 text-brand">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Votre micro capte votre voix.
                </span>
              ) : (
                "Dites quelques mots : la barre doit bouger."
              )}
            </p>
            <span
              className="block h-2.5 overflow-hidden rounded-full bg-[var(--live-soft)]"
              role="presentation"
            >
              <span ref={meterRef} className="block h-full w-0 rounded-full bg-brand transition-[width] duration-75" />
            </span>
          </div>

          {devices.micros.length > 1 ? (
            <label className="flex items-center gap-2.5 text-[13px] font-semibold text-[var(--live-muted)]">
              <Mic className="size-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">Micro</span>
              <select value={micro ?? ""} onChange={(e) => chooseMicro(e.target.value)} className={SELECT}>
                {devices.micros.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Micro ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {video && devices.cameras.length > 1 ? (
            <label className="flex items-center gap-2.5 text-[13px] font-semibold text-[var(--live-muted)]">
              <Camera className="size-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">Caméra</span>
              <select value={camera ?? ""} onChange={(e) => chooseCamera(e.target.value)} className={SELECT}>
                {devices.cameras.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Caméra ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] leading-relaxed text-[var(--live-muted)]">
              Personne ne vous voit ni ne vous entend : ce test reste sur votre appareil.
            </p>
            <Btn variant="o" size="sm" onClick={stop}>
              <Square aria-hidden="true" />
              Arrêter le test
            </Btn>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p className="mx-auto max-w-[44ch] text-[13.5px] leading-relaxed text-[var(--live-muted)]">
            {intro}
          </p>
          <Btn
            variant="o"
            size="sm"
            className="mt-3.5"
            loading={starting}
            onClick={() => void start()}
          >
            <Video aria-hidden="true" />
            {video ? "Tester mon micro et ma caméra" : "Tester mon micro"}
          </Btn>
          {error ? (
            <p role="alert" className="mx-auto mt-3 max-w-[46ch] text-[13.5px] font-semibold leading-relaxed text-danger">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
