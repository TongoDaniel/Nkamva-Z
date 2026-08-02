"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Gauge, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/nk/avatar";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";
import { toast } from "@/components/nk/toast";
import { cn } from "@/lib/utils";
import type { Replay } from "@/features/demo/live-data";

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

export function ReplayPlayer({ replay }: { replay: Replay }) {
  const [playing, setPlaying] = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [speed, setSpeed] = React.useState<number>(1);
  const [notes, setNotes] = React.useState("");

  // Lecture simulée : la position avance tant qu'on est en lecture, à la
  // vitesse choisie. Il n'y a pas de flux — c'est la maquette, pas un lecteur.
  React.useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPosition((current) => {
        const next = current + speed;
        if (next >= replay.durationSeconds) {
          setPlaying(false);
          return replay.durationSeconds;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, speed, replay.durationSeconds]);

  const progress = (position / replay.durationSeconds) * 100;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <section className="min-w-0">
        <div className="overflow-hidden rounded-nk-lg bg-navy shadow-nk">
          <div className="relative grid aspect-video place-items-center bg-navy-2 text-center">
            <Chip tone="gold" className="absolute left-4 top-4">
              Replay
            </Chip>
            <div className="px-6">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "Mettre en pause" : "Lancer la lecture"}
                className="mx-auto grid size-[68px] cursor-pointer place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 [&_svg]:size-7"
              >
                {playing ? <Pause /> : <Play />}
              </button>
              <p className="mt-4 text-[13.5px] leading-relaxed text-[#b9c9dd]">
                Le lecteur vidéo se branchera ici. La progression ci-dessous est simulée.
              </p>
            </div>
          </div>

          <div className="px-5 py-4">
            <label htmlFor="replay-position" className="sr-only">
              Position dans le replay
            </label>
            <input
              id="replay-position"
              type="range"
              min={0}
              max={replay.durationSeconds}
              step={1}
              value={Math.round(position)}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="w-full accent-brand"
              style={{ colorScheme: "dark" }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-display text-[13px] font-bold tabular-nums text-white">
                {clock(position)} <span className="text-[#b9c9dd]">/ {clock(replay.durationSeconds)}</span>
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
            <Link href={`/communautes/${replay.community.slug}`} className="font-bold text-brand hover:text-brand-dark">
              {replay.community.name}
            </Link>{" "}
            · enregistré le{" "}
            {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
              replay.recordedAt,
            )}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2 text-pretty">
            {replay.description}
          </p>

          <div className="mt-5 flex items-center gap-3.5 border-t border-line-2 pt-5">
            <Avatar name={replay.host.name} size="lg" />
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
          <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
            {replay.downloadable
              ? "Le fichier MP4 sera proposé aux membres de la communauté."
              : "Ce replay est réservé à la lecture en ligne : le formateur n'a pas autorisé le téléchargement."}
          </p>
          <Btn
            variant="o"
            block
            disabled={!replay.downloadable}
            onClick={() => toast.success("Le téléchargement des replays n'est pas encore branché.")}
          >
            <Download aria-hidden="true" />
            Télécharger le replay
          </Btn>
        </section>

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
          <p className={cn("mt-2 text-[12.5px] text-ink-3")}>
            Ces notes restent dans cet onglet : rien n&apos;est encore enregistré.
          </p>
        </section>
      </div>
    </div>
  );
}
