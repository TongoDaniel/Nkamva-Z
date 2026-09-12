"use client";

// ==========================================================================
// Visualiseur PDF embarqué (F3.2, arbitrages 121 et 122)
// ==========================================================================
// Ce module n'est **jamais importé statiquement** : `course-player.tsx` le
// charge par `next/dynamic`, et il n'entre donc dans le paquet d'aucune autre
// route. C'est la condition posée par l'arbitrage 122 quand le budget de
// 300 Ko est passé d'une lecture globale à une lecture **par route**.
//
// ## Pourquoi un visualiseur plutôt qu'une balise `<embed>`
//
// Le lecteur natif du navigateur afficherait le document pour rien de plus
// qu'une ligne de HTML. Mais il ne dit pas quelle page est à l'écran, et la
// position de lecture est précisément ce qu'on est venu chercher : sans elle,
// la progression d'un document reste un zéro trompeur et un litige s'instruit
// à l'aveugle. L'arbitrage 121 a tranché en connaissance du coût.
//
// ## Rendu
//
// Une page par canevas, en flux vertical, dessinée quand elle approche de la
// zone visible. Un **seul** calcul au défilement décide de deux choses : ce
// qu'il faut dessiner, et quelle page occupe le plus l'écran — celle-ci
// remonte à l'appelant, qui l'enregistre.
//
// Ce calcul remplace deux `IntersectionObserver`. Ils faisaient le même
// travail plus élégamment, mais leurs rappels sont liés au cycle d'images du
// navigateur : dans un contexte qui n'en produit pas, ils ne se déclenchent
// jamais et le lecteur reste figé sur sa première page sans qu'aucune erreur
// ne le signale. Une mesure directe au défilement n'a pas cette dépendance.

import * as React from "react";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** Bornes du zoom. En deçà on ne lit plus, au-delà on ne fait que défiler. */
const ECHELLE_MIN = 0.5;
const ECHELLE_MAX = 2.5;
const ECHELLE_PAS = 0.25;

/** Marge de pré-dessin, de part et d'autre de la zone visible. */
const MARGE_DESSIN_PX = 800;

/** Hauteur du gabarit d'une page pas encore dessinée. */
const GABARIT_PX = 900;

/**
 * Une page. Le parent décide quand la dessiner ; ce composant ne fait que la
 * dessiner.
 *
 * Le canevas est dimensionné avant le rendu : sans cela, le flux se replie sur
 * lui-même à chaque page dessinée, et la position de défilement saute.
 */
function PageCanvas({
  doc,
  numero,
  echelle,
  dessiner,
}: {
  doc: PDFDocumentProxy;
  numero: number;
  echelle: number;
  dessiner: boolean;
}) {
  const canevas = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!dessiner) return;
    let annule = false;
    let tache: { cancel: () => void } | null = null;

    void (async () => {
      const page = await doc.getPage(numero);
      if (annule) return;

      // Le rapport de pixels de l'écran, borné : au-delà de 2 on triple la
      // mémoire d'un canevas sans que personne ne voie la différence.
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const vue = page.getViewport({ scale: echelle * ratio });
      const cnv = canevas.current;
      const ctx = cnv?.getContext("2d");
      if (!cnv || !ctx) return;

      cnv.width = vue.width;
      cnv.height = vue.height;
      cnv.style.width = `${vue.width / ratio}px`;
      cnv.style.height = `${vue.height / ratio}px`;

      tache = page.render({ canvas: cnv, canvasContext: ctx, viewport: vue });
      try {
        await (tache as unknown as { promise: Promise<void> }).promise;
      } catch {
        // Rendu annulé par un changement d'échelle : sans conséquence.
      }
    })();

    return () => { annule = true; tache?.cancel(); };
  }, [doc, numero, echelle, dessiner]);

  return (
    <div
      data-page={numero}
      className="mx-auto mb-4 w-fit max-w-full overflow-hidden rounded-nk bg-white shadow-nk-sm"
      // Un gabarit avant le dessin : le flux ne doit pas se replier quand une
      // page arrive.
      style={dessiner ? undefined : { height: GABARIT_PX, width: "min(100%, 680px)" }}
    >
      <canvas ref={canevas} className="block max-w-full" aria-label={`Page ${numero}`} />
    </div>
  );
}

export function PdfReader({
  url,
  startPage,
  onPageChange,
}: {
  url: string;
  /** La page où reprendre. 1 quand rien n'a été lu. */
  startPage: number;
  onPageChange: (page: number) => void;
}) {
  const [doc, setDoc] = React.useState<PDFDocumentProxy | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [echelle, setEchelle] = React.useState(1);
  const [page, setPage] = React.useState(startPage);
  /** Les pages à dessiner. Grandit au fil du défilement, ne rétrécit pas. */
  const [aDessiner, setADessiner] = React.useState<Set<number>>(() => new Set([1, 2]));

  const flux = React.useRef<HTMLDivElement>(null);
  const repositionne = React.useRef(false);
  /** La dernière page annoncée à l'appelant, pour ne pas la répéter. */
  const annoncee = React.useRef(startPage);

  React.useEffect(() => {
    let annule = false;
    let charge: PDFDocumentProxy | null = null;

    void (async () => {
      try {
        // Import dynamique **dans** l'effet : la bibliothèque ne part au
        // navigateur qu'une fois cette route ouverte, et jamais au rendu
        // serveur, où `DOMMatrix` n'existe pas.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const tache = pdfjs.getDocument({ url, withCredentials: false });
        charge = await tache.promise;
        if (annule) { void charge.destroy(); return; }
        setDoc(charge);
      } catch {
        if (!annule) setErreur("Ce document n'a pas pu être affiché.");
      }
    })();

    return () => {
      annule = true;
      void charge?.destroy();
    };
  }, [url]);

  /**
   * Le calcul unique : quelle page occupe le plus la fenêtre de lecture, et
   * lesquelles approchent assez pour valoir un dessin.
   *
   * Les mesures se prennent sur le conteneur, pas sur la fenêtre du navigateur
   * : le document défile **à l'intérieur** d'un cadre, et une page peut être
   * hors de l'écran sans cesser d'être la page courante.
   */
  const mesurer = React.useCallback(() => {
    const boite = flux.current;
    if (!boite) return;

    const haut = boite.scrollTop;
    const bas = haut + boite.clientHeight;

    let meilleure = 0;
    let meilleurRecouvrement = 0;
    const proches = new Set<number>();

    for (const noeud of boite.querySelectorAll<HTMLElement>("[data-page]")) {
      const numero = Number(noeud.dataset.page);
      const debut = noeud.offsetTop;
      const fin = debut + noeud.offsetHeight;

      if (fin > haut - MARGE_DESSIN_PX && debut < bas + MARGE_DESSIN_PX) proches.add(numero);

      const recouvrement = Math.min(fin, bas) - Math.max(debut, haut);
      if (recouvrement > meilleurRecouvrement) {
        meilleurRecouvrement = recouvrement;
        meilleure = numero;
      }
    }

    // Le dessin ne se défait pas : une page déjà rendue le reste, sinon un
    // aller-retour la redessinerait à chaque passage.
    setADessiner((courant) => {
      let nouveau: Set<number> | null = null;
      for (const n of proches) {
        if (!courant.has(n)) (nouveau ??= new Set(courant)).add(n);
      }
      return nouveau ?? courant;
    });

    if (meilleure > 0) {
      setPage(meilleure);
      if (annoncee.current !== meilleure) {
        annoncee.current = meilleure;
        onPageChange(meilleure);
      }
    }
  }, [onPageChange]);

  // Reprise, puis première mesure. Un court délai laisse les gabarits se
  // poser : viser une page avant que le flux ait sa hauteur amènerait ailleurs.
  React.useEffect(() => {
    if (!doc) return;
    const id = window.setTimeout(() => {
      if (!repositionne.current && startPage > 1) {
        repositionne.current = true;
        const cible = flux.current?.querySelector<HTMLElement>(`[data-page="${startPage}"]`);
        if (cible && flux.current) flux.current.scrollTop = cible.offsetTop;
      }
      mesurer();
    }, 100);
    return () => window.clearTimeout(id);
  }, [doc, startPage, mesurer]);

  // Le défilement, limité par horloge et non par image : un contexte qui ne
  // rend pas d'images doit quand même suivre la lecture.
  React.useEffect(() => {
    const boite = flux.current;
    if (!boite || !doc) return;

    let dernier = 0;
    let differe: number | undefined;
    const suivre = () => {
      const maintenant = Date.now();
      window.clearTimeout(differe);
      if (maintenant - dernier >= 120) {
        dernier = maintenant;
        mesurer();
      } else {
        // Le dernier soubresaut compte autant que les autres : sans ce report,
        // s'arrêter entre deux battements laisserait la page d'avant.
        differe = window.setTimeout(() => { dernier = Date.now(); mesurer(); }, 140);
      }
    };

    boite.addEventListener("scroll", suivre, { passive: true });
    window.addEventListener("resize", suivre);
    return () => {
      window.clearTimeout(differe);
      boite.removeEventListener("scroll", suivre);
      window.removeEventListener("resize", suivre);
    };
  }, [doc, mesurer]);

  function aller(numero: number) {
    const cible = Math.max(1, Math.min(numero, doc?.numPages ?? 1));
    const noeud = flux.current?.querySelector<HTMLElement>(`[data-page="${cible}"]`);
    if (noeud && flux.current) {
      flux.current.scrollTop = noeud.offsetTop;
      mesurer();
    }
  }

  if (erreur) {
    return (
      <div className="grid min-h-[380px] place-items-center rounded-nk-lg border border-line bg-card p-5 text-center sm:p-8">
        <p className="max-w-[46ch] text-ink-2">
          {erreur} Vous pouvez le télécharger depuis la liste de vos ressources.
        </p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="grid min-h-[380px] place-items-center rounded-nk-lg border border-line bg-card">
        <Loader2 className="size-8 animate-spin text-ink-3" aria-hidden="true" />
        <span className="sr-only">Chargement du document…</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-nk-lg border border-line bg-paper shadow-nk-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-card px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => aller(page - 1)}
            disabled={page <= 1}
            aria-label="Page précédente"
            className="nk-tap grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => aller(page + 1)}
            disabled={page >= doc.numPages}
            aria-label="Page suivante"
            className="nk-tap grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
          <p className="ml-2 text-[13.5px] font-semibold text-ink-2" aria-live="polite">
            Page <b className="text-ink">{page}</b> sur {doc.numPages}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEchelle((e) => Math.max(ECHELLE_MIN, e - ECHELLE_PAS))}
            disabled={echelle <= ECHELLE_MIN}
            aria-label="Réduire"
            className="nk-tap grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40"
          >
            <ZoomOut className="size-4" aria-hidden="true" />
          </button>
          <span className="min-w-[3.5rem] text-center text-[13px] font-semibold text-ink-3">
            {Math.round(echelle * 100)} %
          </span>
          <button
            type="button"
            onClick={() => setEchelle((e) => Math.min(ECHELLE_MAX, e + ECHELLE_PAS))}
            disabled={echelle >= ECHELLE_MAX}
            aria-label="Agrandir"
            className="nk-tap grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40"
          >
            <ZoomIn className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/*
        `relative` n'est pas décoratif : sans lui, `offsetTop` d'une page se
        mesure depuis un ancêtre positionné quelconque, et les décalages ne
        sont plus dans le même repère que `scrollTop`. La page courante s'en
        trouve décalée d'autant que le cadre est bas dans la page.
      */}
      <div
        ref={flux}
        className="relative max-h-[72vh] min-h-[320px] overflow-y-auto overscroll-contain p-4"
      >
        {Array.from({ length: doc.numPages }, (_, i) => (
          <PageCanvas
            key={i + 1}
            doc={doc}
            numero={i + 1}
            echelle={echelle}
            dessiner={aDessiner.has(i + 1)}
          />
        ))}
      </div>
    </div>
  );
}
