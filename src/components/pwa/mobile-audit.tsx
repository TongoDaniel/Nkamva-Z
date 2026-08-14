"use client";

import * as React from "react";

/**
 * Sonde d'audit mobile — outil de développement.
 *
 * Elle n'existe que pour répondre à une question qu'on ne peut pas trancher
 * depuis un poste de travail : les écrans **authentifiés** débordent-ils, ou
 * portent-ils des cibles trop petites, sur un vrai téléphone avec de vraies
 * données ? Une session ne peut pas être fabriquée côté outillage, donc la
 * mesure doit se faire là où la session existe.
 *
 * Ne se monte jamais en production, et seulement si l'URL porte `?audit=1`.
 * Le bouton « Copier » met le rapport dans le presse-papier, prêt à être
 * recollé dans la conversation.
 */

interface Finding {
  quoi: string;
  detail: string;
}

interface Report {
  page: string;
  largeur: number;
  debordement: number;
  coupables: Finding[];
  champsZoom: Finding[];
  ciblesPetites: Finding[];
}

/** Classes utiles pour identifier un élément dans le code source. */
function describe(el: Element) {
  const cls = String((el as HTMLElement).className || "")
    .split(/\s+/)
    .filter((c) => !/^(hover|focus|active|group|peer|sm|md|lg|xl):/.test(c))
    .slice(0, 6)
    .join(" ");
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
}

/** Zone tactile réelle : `.nk-tap` l'étend par un pseudo-élément. */
function hitBox(el: Element) {
  const r = el.getBoundingClientRect();
  let w = r.width;
  let h = r.height;
  if (getComputedStyle(el).position !== "static") {
    const after = getComputedStyle(el, "::after");
    if (after.content === '""') {
      w = Math.max(w, parseFloat(after.width) || 0);
      h = Math.max(h, parseFloat(after.height) || 0);
    }
  }
  return { w, h };
}

function audit(): Report {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const report: Report = {
    page: location.pathname,
    largeur: vw,
    debordement: de.scrollWidth - vw,
    coupables: [],
    champsZoom: [],
    ciblesPetites: [],
  };

  // — Débordement horizontal : qui dépasse sans être contenu par un ancêtre —
  if (report.debordement > 0) {
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= vw + 1) return;
      let p = el.parentElement;
      while (p && p !== document.body) {
        if (getComputedStyle(p).overflowX !== "visible") return;
        p = p.parentElement;
      }
      report.coupables.push({
        quoi: describe(el),
        detail: `largeur ${Math.round(r.width)}px, bord droit à ${Math.round(r.right)}px`,
      });
    });
    report.coupables = report.coupables.slice(0, 6);
  }

  // — Champs sous 16px : iOS zoome à la mise au point —
  document.querySelectorAll("input,select,textarea").forEach((el) => {
    const input = el as HTMLInputElement;
    if (input.type === "hidden" || /sr-only/.test(String(input.className))) return;
    if (["checkbox", "radio", "range", "color"].includes(input.type)) return;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) report.champsZoom.push({ quoi: describe(el), detail: `${fs}px` });
  });
  report.champsZoom = report.champsZoom.slice(0, 8);

  // — Cibles tactiles sous 44px, hors liens en pleine ligne de texte —
  const seen = new Set<string>();
  document
    .querySelectorAll('button,a[href],[role="button"],select,summary,input[type="checkbox"],input[type="radio"]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // Hors du cadre : lien d'évitement (`left: -9999px`) et compagnie. Ils
      // ne deviennent visibles qu'au focus clavier, jamais au doigt.
      if (r.right <= 0 || r.left >= vw || r.bottom <= 0) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") return;
      // Un lien au fil du texte est exempté (WCAG 2.5.5).
      if (el.tagName === "A" && cs.display === "inline") return;
      const { w, h } = hitBox(el);
      if (w >= 44 && h >= 44) return;
      const key = describe(el) + Math.round(h);
      if (seen.has(key)) return;
      seen.add(key);
      report.ciblesPetites.push({
        quoi: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24) || describe(el),
        detail: `${Math.round(w)}×${Math.round(h)} — ${describe(el)}`,
      });
    });
  report.ciblesPetites = report.ciblesPetites.slice(0, 10);

  return report;
}

export function MobileAudit() {
  const [report, setReport] = React.useState<Report | null>(null);
  const [open, setOpen] = React.useState(false);
  const [copie, setCopie] = React.useState(false);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!new URLSearchParams(window.location.search).has("audit")) return;
    // Après peinture : les grilles doivent être posées pour être mesurées.
    const t = setTimeout(() => {
      setReport(audit());
      setOpen(true);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  if (!report) return null;

  const total =
    (report.debordement > 0 ? 1 : 0) + report.champsZoom.length + report.ciblesPetites.length;
  const ok = total === 0;

  const copier = () => {
    const txt = JSON.stringify(report, null, 2);
    void navigator.clipboard?.writeText(txt).then(
      () => {
        setCopie(true);
        setTimeout(() => setCopie(false), 2000);
      },
      () => setCopie(false),
    );
  };

  return (
    <div className="nk-above-tabbar nk-safe-b fixed inset-x-0 bottom-0 z-[9999] p-2 font-sans">
      <div className="max-h-[70vh] overflow-y-auto rounded-2xl border-2 border-ink bg-card p-3 shadow-nk-lg">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-full text-[15px] font-bold text-white ${
              ok ? "bg-brand" : "bg-danger"
            }`}
            aria-hidden="true"
          >
            {ok ? "✓" : total}
          </span>
          <b className="flex-1 text-[13px]">
            {report.page} — {report.largeur}px
            <span className="block font-normal text-ink-2">
              {ok ? "aucun défaut" : `${total} point(s) à voir`}
            </span>
          </b>
          <span className="text-[13px] font-bold text-ink-3">{open ? "▼" : "▲"}</span>
        </button>

        {open ? (
          <div className="mt-3 grid gap-3 text-[13px] leading-snug">
            <Section
              titre={`Débordement horizontal : ${report.debordement}px`}
              items={report.coupables}
              vide={report.debordement <= 0}
            />
            <Section titre="Champs sous 16px (zoom iOS)" items={report.champsZoom} vide={!report.champsZoom.length} />
            <Section
              titre="Cibles tactiles sous 44px"
              items={report.ciblesPetites}
              vide={!report.ciblesPetites.length}
            />
            <button
              type="button"
              onClick={copier}
              className="min-h-11 rounded-full bg-ink px-4 text-[13px] font-semibold text-paper"
            >
              {copie ? "Copié — collez-le dans la conversation" : "Copier le rapport"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({ titre, items, vide }: { titre: string; items: Finding[]; vide: boolean }) {
  return (
    <div>
      <b className="block border-b border-line pb-1 text-[13px]">{titre}</b>
      {vide ? (
        <p className="pt-1 text-ink-3">rien à signaler</p>
      ) : (
        <ul className="grid gap-1 pt-1">
          {items.map((f, i) => (
            <li key={i}>
              <b className="font-semibold">{f.quoi}</b>
              <span className="block text-ink-2">{f.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
