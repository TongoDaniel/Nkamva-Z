"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, LayoutGrid, Presentation, MonitorUp, User } from "lucide-react";
import { Avatar } from "./avatar";
import { StPill } from "./status-pill";
import { cn } from "@/lib/utils";
import type { LiveTile } from "@/hooks/use-live-room";

/**
 * La scène d'un direct — les tuiles, leur disposition, et le plein écran.
 *
 * Partagée par la salle de l'apprenant et la console de l'animateur (arbitrage
 * 145). Les deux écrans rendaient chacun leur grille : trois colonnes fixes,
 * toutes les tuiles de même taille, et l'animateur perdu au milieu dès le
 * quatrième participant. Recopier une seconde fois la disposition aurait produit
 * deux scènes qui divergent au premier ajustement — le défaut que la
 * convergence des cartes de ressource a déjà coûté cher.
 *
 * Trois règles, et elles ne se négocient pas depuis l'extérieur :
 *
 * 1. **L'animateur est toujours la personne la plus visible.** En galerie sa
 *    tuile est deux fois plus large et deux fois plus haute que les autres ; en
 *    intervenant, c'est lui qui occupe la grande place ; en présentation, il est
 *    la première vignette à côté de l'écran partagé. Aucun locuteur actif ne le
 *    déloge : parler plus fort n'est pas animer.
 * 2. **Un écran partagé prend la grande place**, et seulement elle. C'est ce
 *    qu'on est venu voir ; le visage de qui présente reste dans la bande, à côté
 *    de celui de l'animateur.
 * 3. **La disposition est un choix de lecteur**, pas un état de la séance : elle
 *    reste dans son navigateur et ne se pousse à personne.
 */

export type StageLayout = "galerie" | "intervenant" | "presentation";

/** Ce que le lecteur a choisi la dernière fois, par navigateur. */
const LAYOUT_KEY = "nk.live.disposition";

const LAYOUTS: Array<{ value: StageLayout; label: string; icon: React.ElementType }> = [
  { value: "galerie", label: "Galerie", icon: LayoutGrid },
  { value: "intervenant", label: "Intervenant", icon: User },
  { value: "presentation", label: "Présentation", icon: Presentation },
];

export interface StagePerson {
  /** L'identifiant de l'utilisateur, qui est aussi son identité de transport. */
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

function TileView({
  tile,
  person,
  isHost,
  size,
  /**
   * En plein écran, la place disponible est une **hauteur**, pas une largeur :
   * garder `aspect-video` y faisait déborder la grille hors de la fenêtre, et
   * les tuiles sortaient par le bas. La tuile prend alors la case entière, et
   * c'est la vidéo qui se débrouille à l'intérieur.
   */
  fill = false,
  className,
}: {
  tile: LiveTile;
  person: StagePerson | undefined;
  isHost: boolean;
  /** La grande place se légende plus gros, et l'avatar de repli y grandit. */
  size: "main" | "grid" | "strip";
  fill?: boolean;
  className?: string;
}) {
  // Déstructurée d'emblée : `attach` sert de `ref` à la vidéo, et la règle
  // `react-hooks/refs` tient alors tout l'objet `tile` pour une ref — lire
  // `tile.isLocal` au rendu passait pour la lecture d'une ref.
  const { attach, isLocal, speaking, kind } = tile;
  const name = isLocal ? "Vous" : (person?.name ?? tile.name);
  const screen = kind === "screen";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-nk bg-[var(--live-tile)]",
        // Un écran partagé n'est pas un visage : on le montre entier plutôt que
        // recadré, quitte à laisser des bandes. Recadrer une capture d'écran
        // coupe précisément ce qu'on est venu lire.
        size === "strip"
          ? "aspect-video w-[132px] shrink-0 sm:w-[168px]"
          : fill
            ? "size-full min-h-0"
            : "aspect-video w-full",
        speaking && "ring-2 ring-brand",
        className,
      )}
    >
      {attach ? (
        <video
          ref={attach}
          autoPlay
          playsInline
          // Une piste locale se rend muette, sinon le larsen est immédiat.
          muted={isLocal}
          className={cn("size-full", screen ? "object-contain" : "object-cover")}
        />
      ) : (
        <span className="grid size-full place-items-center">
          <Avatar
            name={name}
            src={person?.avatarUrl}
            size={size === "strip" ? "md" : "lg"}
            alt={`Photo de ${name}`}
          />
        </span>
      )}

      <span className="absolute bottom-1.5 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5">
        <span className="truncate rounded-full bg-black/55 px-2 py-0.5 text-[13px] font-semibold text-white">
          {screen ? `Écran de ${name}` : name}
        </span>
        {/* Dans la bande, la pastille « Animateur » mangeait la place du nom —
            « V… » sur un téléphone. Elle n'y sert pas : l'animateur y est
            toujours la première vignette. */}
        {isHost && !screen && size !== "strip" ? (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[13px] font-semibold text-white">
            Animateur
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function LiveStage({
  tiles,
  people,
  hostUserId,
  /** Ce qui s'affiche quand aucune piste n'est publiée — attente, panne, salle fermée. */
  empty,
  /** Le bandeau de commandes, rendu **dans** la scène pour survivre au plein écran. */
  controls,
  /**
   * Arbitrage 148 — le ton de la scène. Posé sur le cadre lui-même, et pas
   * seulement sur la salle qui le contient : le plein cadre passe par un portail
   * sur `body`, hors de portée des classes de ses ancêtres.
   */
  tone = "sombre",
  className,
}: {
  tone?: "sombre" | "clair";
  tiles: LiveTile[];
  people: StagePerson[];
  hostUserId: string | null;
  empty: React.ReactNode;
  controls?: React.ReactNode;
  className?: string;
}) {
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [chosen, setChosen] = React.useState<StageLayout | null>(null);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAYOUT_KEY);
      if (saved === "galerie" || saved === "intervenant" || saved === "presentation") {
        setChosen(saved);
      }
    } catch {
      // Navigation privée, stockage refusé : la disposition par défaut fera.
    }
  }, []);

  /**
   * Le plein écran « natif » n'est pas toujours disponible, et le repli n'est
   * pas un luxe : **Safari sur iPhone n'implémente pas `requestFullscreen` sur
   * un élément** — seule une balise vidéo sait s'y mettre en plein écran. Sur la
   * moitié des téléphones que sert la plateforme, le bouton n'aurait donc rien
   * fait du tout.
   *
   * D'où deux modes : l'API quand elle répond, et sinon un plein cadre en CSS,
   * qui occupe la fenêtre sans la quitter. `plein` dit lequel est en cours.
   */
  const [plein, setPlein] = React.useState<"non" | "api" | "cadre">("non");
  const fullscreen = plein !== "non";

  // Le plein écran natif se quitte aussi par Échap, par le bouton du navigateur,
  // ou parce qu'un autre élément l'a pris : l'état se lit sur le document,
  // jamais sur ce qu'on a demandé.
  React.useEffect(() => {
    const sync = () => {
      if (document.fullscreenElement === frameRef.current) setPlein("api");
      else setPlein((current) => (current === "api" ? "non" : current));
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Échap ferme le plein cadre comme il ferme le plein écran natif : les deux
  // doivent se quitter du même geste, sinon le repli devient un piège.
  React.useEffect(() => {
    if (plein !== "cadre") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlein("non");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plein]);

  const people_ = React.useMemo(() => {
    const map = new Map<string, StagePerson>();
    for (const p of people) map.set(p.userId, p);
    return map;
  }, [people]);

  const screens = tiles.filter((t) => t.kind === "screen");
  const cameras = tiles.filter((t) => t.kind === "camera");

  // Règle 1 — l'animateur d'abord, toujours. Le reste garde l'ordre d'arrivée :
  // un classement au locuteur actif ferait danser les tuiles à chaque phrase.
  const ordered = React.useMemo(() => {
    const host = cameras.filter((t) => t.identity === hostUserId);
    const others = cameras.filter((t) => t.identity !== hostUserId);
    return [...host, ...others];
  }, [cameras, hostUserId]);

  // Règle 2 — un écran partagé impose la présentation tant que le lecteur n'a
  // rien choisi d'autre. Il l'impose aussi à un choix « intervenant » : on ne
  // partage pas son écran pour qu'il reste invisible.
  const layout: StageLayout =
    screens.length > 0 && chosen !== "galerie"
      ? "presentation"
      : (chosen ?? (ordered.length > 2 ? "galerie" : "intervenant"));

  const choose = (value: StageLayout) => {
    setChosen(value);
    try {
      window.localStorage.setItem(LAYOUT_KEY, value);
    } catch {
      // Sans stockage, le choix ne vaut que pour cette visite. C'est tout.
    }
  };

  const toggleFullscreen = () => {
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
    // L'API d'abord : elle masque la barre du navigateur, ce que le repli ne
    // sait pas faire. Son refus est rendu **après** coup (promesse rejetée),
    // d'où le repli dans le `catch` plutôt qu'un test préalable — `fullscreenEnabled`
    // répond « oui » dans des cadres qui refusent ensuite.
    // Le refus arrive de deux façons selon le navigateur et le cadre : promesse
    // rejetée, ou exception jetée tout de suite (« Permissions check failed »
    // dans un cadre sans `allowfullscreen`). Les deux mènent au repli — n'en
    // rattraper qu'une laissait un bouton sans effet.
    try {
      const demande = el.requestFullscreen?.();
      if (!demande) {
        setPlein("cadre");
        return;
      }
      demande.then(() => setPlein("api")).catch(() => setPlein("cadre"));
    } catch {
      setPlein("cadre");
    }
  };

  const view = (tile: LiveTile, size: "main" | "grid" | "strip", className?: string) => (
    <TileView
      key={tile.key}
      tile={tile}
      person={people_.get(tile.identity)}
      isHost={tile.identity === hostUserId}
      size={size}
      fill={fullscreen && size !== "strip"}
      className={className}
    />
  );

  const nothing = tiles.every((t) => t.attach === null);

  let body: React.ReactNode;
  if (tiles.length === 0 || nothing) {
    // Pas de hauteur minimale imposée sur téléphone : la salle y plafonne la
    // scène (arbitrage 147), et 240 px d'attente y faisaient apparaître une
    // barre de défilement dans une scène qui n'avait rien à montrer.
    body = (
      <div className="grid h-full place-items-center px-6 py-4 text-center sm:py-6 lg:min-h-[240px]">
        {empty}
      </div>
    );
  } else if (layout === "presentation" && screens.length > 0) {
    body = (
      <div className={cn("flex flex-col gap-3 p-3", fullscreen && "h-full")}>
        <div className={cn(fullscreen && "flex min-h-0 flex-1 flex-col gap-3")}>
          {screens.map((s) => view(s, "main"))}
        </div>
        {ordered.length > 0 ? (
          <div className="flex shrink-0 gap-3 overflow-x-auto pb-1">
            {ordered.map((t) => view(t, "strip"))}
          </div>
        ) : null}
      </div>
    );
  } else if (layout === "intervenant") {
    const [main, ...rest] = ordered;
    body = (
      <div className={cn("flex flex-col gap-3 p-3", fullscreen && "h-full")}>
        <div className={cn(fullscreen && "flex min-h-0 flex-1 flex-col")}>
          {main ? view(main, "main") : null}
        </div>
        {rest.length > 0 ? (
          <div className="flex shrink-0 gap-3 overflow-x-auto pb-1">
            {rest.map((t) => view(t, "strip"))}
          </div>
        ) : null}
      </div>
    );
  } else {
    // La galerie montre **tout**, écrans partagés compris : la première version
    // n'affichait que les caméras, si bien que choisir « galerie » pendant une
    // présentation faisait disparaître ce qu'on était venu voir.
    //
    // Deux tailles doubles peuvent donc coexister — l'écran et l'animateur — et
    // c'est voulu : la règle 1 dit que l'animateur est la **personne** la plus
    // visible, pas qu'il passe devant le document qu'on commente. Un écran de
    // travail réduit à 245 px ne se lit pas ; à ce compte-là, autant ne pas
    // l'afficher.
    const grille = [...screens, ...ordered];
    body = (
      <div
        className={cn(
          "grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3",
          // En plein écran, les rangées se partagent la hauteur au lieu de la
          // déduire du format 16/9 : sans cela, deux tuiles doubles suffisaient
          // à pousser la grille hors de la fenêtre.
          fullscreen && "h-full auto-rows-fr",
        )}
      >
        {grille.map((t) =>
          view(
            t,
            "grid",
            t.kind === "screen" || t.identity === hostUserId
              ? "sm:col-span-2 sm:row-span-2"
              : undefined,
          ),
        )}
      </div>
    );
  }

  const cadre = (
    <div
      ref={frameRef}
      className={cn(
        // Toujours une colonne : les tuiles défilent, la bande de commandes ne
        // bouge pas. C'est ce qui permet à la salle de contraindre la hauteur de
        // la scène sur téléphone (arbitrage 147) sans jamais perdre le micro de
        // vue — auparavant, le `flex` n'existait qu'en plein écran, et une scène
        // trop haute poussait les commandes hors de l'écran.
        "nk-live relative flex flex-col bg-[var(--live-bg-2)]",
        tone === "clair" && "nk-live-clair",
        // En plein écran, l'élément devient la fenêtre : la scène s'étire, et la
        // bande de commandes reste collée en bas. Le plein cadre fait la même
        // chose par-dessus la page, sans la quitter.
        fullscreen && "justify-center",
        // `dvh` et non la hauteur d'écran classique : la barre d'adresse mobile rend `100vh` plus
        // grand que le visible, et le garde-fou `check:mobile` le refuse.
        plein === "api" && "h-[100dvh] w-screen",
        // Au-dessus de la barre collante de l'application (`z-50`) et de la
        // barre d'onglets mobile (`z-90`), sous les modales (`z-200`) : un
        // plein écran qui laisse dépasser le menu n'est pas un plein écran.
        plein === "cadre" && "fixed inset-0 z-100 h-[100dvh] w-screen",
        className,
      )}
    >
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-[var(--live-glass)] p-1 shadow-nk-sm backdrop-blur-sm">
        {LAYOUTS.map(({ value, label, icon: Icon }) => {
          const active = layout === value;
          // La présentation ne s'offre que s'il y a un écran à présenter : un
          // bouton qui ne change rien se lit comme une panne.
          if (value === "presentation" && screens.length === 0) return null;
          return (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              aria-pressed={active}
              title={`Disposition ${label.toLowerCase()}`}
              className={cn(
                "grid size-8 cursor-pointer place-items-center rounded-full transition [&_svg]:size-4",
                active
                  ? "bg-[var(--live-glass-on)] text-[var(--live-glass-on-fg)]"
                  : "text-[var(--live-glass-fg)] hover:bg-[var(--live-glass-on)] hover:text-[var(--live-glass-on-fg)]",
              )}
            >
              <Icon aria-hidden="true" />
              <span className="sr-only">Disposition {label.toLowerCase()}</span>
            </button>
          );
        })}
        <span className="mx-0.5 h-5 w-px bg-[var(--live-line)]" aria-hidden="true" />
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-pressed={fullscreen}
          title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
          className="grid size-8 cursor-pointer place-items-center rounded-full text-[var(--live-glass-fg)] transition hover:bg-[var(--live-glass-on)] hover:text-[var(--live-glass-on-fg)] [&_svg]:size-4"
        >
          {fullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          <span className="sr-only">{fullscreen ? "Quitter le plein écran" : "Plein écran"}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      {controls ? <div className="shrink-0">{controls}</div> : null}
    </div>
  );

  /**
   * Le plein cadre passe par un portail sur `body`, et pas seulement par un
   * `z-index` : la coquille applicative pose `position: relative; z-index: 1`
   * sur `<main>`, ce qui ouvre un **contexte d'empilement**. À l'intérieur,
   * `z-100` ne vaut plus rien face à l'en-tête collant de la page — la barre de
   * navigation restait affichée par-dessus le « plein » écran. Sorti du
   * `<main>`, l'élément se compare enfin aux barres elles-mêmes.
   */
  return plein === "cadre" ? createPortal(cadre, document.body) : cadre;
}

/** Le bandeau « quelqu'un présente », affiché hors de la scène. */
export function SharingNotice({ name }: { name: string }) {
  return (
    <p className="flex items-center justify-center gap-2 border-t border-[var(--live-line)] px-5 py-2.5 text-[13px] font-semibold text-[var(--live-muted)]">
      <MonitorUp className="size-4 text-brand" aria-hidden="true" />
      <span aria-live="polite">
        <b className="text-[var(--live-fg)]">{name}</b> partage son écran
      </span>
      <StPill tone="info">Présentation</StPill>
    </p>
  );
}
