import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileClock, Inbox } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { EmptyState } from "@/components/nk/empty-state";
import { getAuthContext } from "@/lib/api";
import { listAuditLogs, getAuditStats, AUDIT_ACTION_GROUPS } from "@/lib/audit-review";
import { auditActionLabel, auditTargetLabel, shortenTargetId } from "@/lib/audit-labels";
import { fmtDateTime } from "@/lib/format";
import { AuditRow } from "./audit-row";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journal d'audit",
  robots: { index: false },
};

const PAGE_SIZE = 30;

export default async function JournalAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ groupe?: string; cible?: string; page?: string }>;
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

  const [result, stats] = await Promise.all([
    listAuditLogs({ group, targetId: sp.cible, page, pageSize: PAGE_SIZE }),
    getAuditStats(),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (targetGroup: string, targetPage = 1) =>
    `/admin/journal-audit?groupe=${targetGroup}${sp.cible ? `&cible=${sp.cible}` : ""}${
      targetPage > 1 ? `&page=${targetPage}` : ""
    }`;

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

      {sp.cible ? (
        <p className="mb-5 flex flex-wrap items-center gap-3 rounded-nk-lg border border-line bg-paper px-4 py-3 text-[13px]">
          <span className="text-ink-2">
            Filtré sur l&apos;objet <code className="font-mono text-[12.5px]">{sp.cible}</code>
          </span>
          <Link href={`/admin/journal-audit?groupe=${group}`} className="font-bold text-brand">
            Retirer le filtre
          </Link>
        </p>
      ) : null}

      <nav aria-label="Filtrer par domaine" className="mb-5">
        <ul className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1">
          {AUDIT_ACTION_GROUPS.map((g) => (
            <li key={g.value}>
              <Link
                href={href(g.value)}
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

      <AdminCard title={`${result.total} entrée${result.total > 1 ? "s" : ""}`}>
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Aucune entrée"
            description="Rien n'a encore été journalisé dans ce domaine."
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
                href={href(group, p)}
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
        personne ne peut le retoucher, pas même depuis cet écran.
      </p>
    </>
  );
}
