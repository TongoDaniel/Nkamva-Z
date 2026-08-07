import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileClock, Inbox } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import {
  listAuditLogs,
  getAuditStats,
  listAuditActions,
  listAuditActors,
  AUDIT_ACTION_GROUPS,
  ACTOR_SYSTEM,
  ACTOR_HUMAN,
} from "@/lib/audit-review";
import { auditActionLabel, auditTargetLabel, shortenTargetId } from "@/lib/audit-labels";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { AuditRow } from "./audit-row";
import { AuditFilters } from "./audit-filters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journal d'audit",
  robots: { index: false },
};

const PAGE_SIZE = 30;

/** `<input type="date">` ne rend que cette forme ; tout le reste est ignoré. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

interface SearchParams {
  groupe?: string;
  cible?: string;
  page?: string;
  q?: string;
  action?: string;
  acteur?: string;
  du?: string;
  au?: string;
}

export default async function JournalAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await getAuthContext();
  // Décision 7 — le journal est lisible par le Super-admin **uniquement**,
  // alors même que les actions des trois rôles y sont écrites. Finances et
  // Modération n'y ont aucun accès, pas même en lecture sur leur propre
  // périmètre.
  if (auth?.user.adminRole !== "SUPER_ADMIN") redirect("/admin");

  const sp = await searchParams;
  const group = AUDIT_ACTION_GROUPS.some((g) => g.value === sp.groupe) ? sp.groupe! : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const target = sp.cible?.trim() || null;

  // Les options des menus sont lues avant d'interpréter les paramètres : un
  // filtre est retenu seulement s'il désigne quelque chose qui existe en base.
  // Sans cette validation, une URL bricolée renverrait une liste vide et
  // l'écran laisserait croire qu'il ne s'est rien passé.
  const [actions, actors, stats] = await Promise.all([
    listAuditActions(),
    listAuditActors(),
    getAuditStats(),
  ]);

  const q = (sp.q ?? "").trim().slice(0, 120);
  const action = actions.includes(sp.action ?? "") ? sp.action! : "";
  const acteur =
    sp.acteur === ACTOR_SYSTEM ||
    sp.acteur === ACTOR_HUMAN ||
    actors.some((a) => a.id === sp.acteur)
      ? sp.acteur!
      : "";
  const du = ISO_DAY.test(sp.du ?? "") ? sp.du! : "";
  const au = ISO_DAY.test(sp.au ?? "") ? sp.au! : "";

  // Bornes incluses des deux côtés : « du 7 au 7 août » doit rendre la journée
  // du 7, pas son premier instant.
  const from = du ? new Date(`${du}T00:00:00`) : undefined;
  const to = au ? new Date(`${au}T23:59:59.999`) : undefined;
  const invertedRange = Boolean(from && to && from > to);

  const result = await listAuditLogs({
    group,
    targetId: target ?? undefined,
    search: q || undefined,
    action: action || undefined,
    actorId: acteur || undefined,
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  });

  const filters = { q, action, acteur, du, au };
  const activeCount = Object.values(filters).filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  /**
   * Une URL construite, et non concaténée : les filtres doivent survivre au
   * changement d'onglet et à la pagination. Les perdre à chaque clic est le
   * défaut qui rend un filtre inutilisable — on refait sa recherche à chaque
   * page au lieu de la parcourir.
   */
  const buildHref = (
    overrides: Partial<{ groupe: string; page: number; clearFilters: boolean }> = {},
  ) => {
    const params = new URLSearchParams();
    params.set("groupe", overrides.groupe ?? group);
    if (target) params.set("cible", target);
    if (!overrides.clearFilters) {
      if (q) params.set("q", q);
      if (action) params.set("action", action);
      if (acteur) params.set("acteur", acteur);
      if (du) params.set("du", du);
      if (au) params.set("au", au);
    }
    const targetPage = overrides.page ?? 1;
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/admin/journal-audit?${params.toString()}`;
  };

  const filtered = activeCount > 0 || Boolean(target);

  return (
    <>
      <AdminHead
        title="Journal d'audit"
        lead="Toutes les actions des trois rôles y sont écrites, dans la transaction qui les produit. Rien ne s'y modifie ni ne s'y efface."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="brand" value={stats.total} label="entrées au total" />
        <StatTile tone="blue" value={stats.last24h} label="sur les dernières 24 h" />
        <StatTile tone="gold" value={stats.distinctActors} label="acteurs distincts" />
        <StatTile tone="clay" value={stats.distinctActions} label="types d'action" />
      </div>

      {target ? (
        <p className="mb-5 flex flex-wrap items-center gap-3 rounded-nk-lg border border-line bg-paper px-4 py-3 text-[13px]">
          <span className="text-ink-2">
            Filtré sur l&apos;objet <code className="font-mono text-[12.5px]">{target}</code>
          </span>
          <Link
            href={`/admin/journal-audit?groupe=${group}`}
            className="font-bold text-brand hover:underline"
          >
            Retirer le filtre
          </Link>
        </p>
      ) : null}

      <nav aria-label="Filtrer par domaine" className="mb-5">
        <ul className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1">
          {AUDIT_ACTION_GROUPS.map((g) => (
            <li key={g.value}>
              <Link
                href={buildHref({ groupe: g.value })}
                aria-current={g.value === group ? "page" : undefined}
                className={
                  g.value === group
                    ? "block whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-paper"
                    : "block whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-bold text-ink-2 hover:text-ink"
                }
              >
                {g.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <AuditFilters
        group={group}
        target={target}
        actions={actions}
        actors={actors}
        values={filters}
        activeCount={activeCount}
        resetHref={buildHref({ clearFilters: true })}
      />

      {invertedRange ? (
        <p role="alert" className="mb-5 rounded-xl bg-gold-tint px-4 py-3 text-[12.5px] text-gold-ink">
          La date de début est postérieure à la date de fin : aucune entrée ne peut tomber dans
          cet intervalle.
        </p>
      ) : null}

      <AdminCard
        title={`${fmtNumber(result.total)} entrée${result.total > 1 ? "s" : ""}`}
        action={
          filtered ? (
            <span className="text-[12.5px] text-ink-3">
              sur {fmtNumber(stats.total)} au total
            </span>
          ) : null
        }
      >
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Aucune entrée"
            description={
              filtered
                ? "Aucune entrée ne répond à ces filtres. Le journal n'en a perdu aucune — c'est la recherche qui est trop étroite."
                : "Rien n'a encore été journalisé dans ce domaine."
            }
            action={
              filtered ? (
                <Link href={buildHref({ clearFilters: true })} className="font-bold text-brand hover:underline">
                  Effacer les filtres
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col">
            {result.items.map((entry) => (
              <AuditRow
                key={entry.id}
                action={entry.action}
                actionLabel={auditActionLabel(entry.action)}
                actorLabel={
                  entry.actor
                    ? entry.actor.fullName ?? entry.actor.email
                    : entry.actorRole
                      ? `Système · ${entry.actorRole}`
                      : "Système"
                }
                actorRole={entry.actor?.adminRole ?? entry.actorRole ?? null}
                targetLabel={auditTargetLabel(entry.targetType)}
                targetId={entry.targetId}
                targetIdShort={entry.targetId ? shortenTargetId(entry.targetId) : null}
                createdAt={fmtDateTime(entry.createdAt) ?? ""}
                createdAtIso={entry.createdAt.toISOString()}
                meta={entry.meta}
                group={group}
              />
            ))}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label="Pagination du journal" className="flex flex-wrap justify-center gap-2 pt-5">
            {Array.from({ length: Math.min(pages, 12) }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={buildHref({ page: p })}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={
                  p === page
                    ? "grid size-9 place-items-center rounded-nk-sm bg-ink text-[13px] font-bold text-paper"
                    : "grid size-9 place-items-center rounded-nk-sm border border-line bg-card text-[13px] font-bold text-ink-2 hover:border-ink-3"
                }
              >
                {p}
              </Link>
            ))}
          </nav>
        ) : null}
      </AdminCard>

      <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-3">
        <FileClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Le journal n&apos;expose aucune action de modification : il n&apos;a de valeur que si
        personne ne peut le retoucher, pas même depuis cet écran. Filtrer ne cache rien —
        l&apos;écran annonce toujours le total dont il montre un extrait.
      </p>
    </>
  );
}
