import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Inbox } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { BtnLink } from "@/components/nk/button-link";
import { Avatar } from "@/components/nk/avatar";
import { getAuthContext } from "@/lib/api";
import { listApplications, getApplicationStats } from "@/lib/trainer-application-review";
import { fmtDate } from "@/lib/format";
import { APPLICATION_STATUS } from "./status";
import type { TrainerApplicationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Validation des formateurs",
  robots: { index: false },
};

const PAGE_SIZE = 20;
const TABS: Array<{ value: string; label: string }> = [
  { value: "SUBMITTED", label: "À traiter" },
  { value: "RESUBMISSION_PENDING", label: "En attente du candidat" },
  { value: "APPROVED", label: "Acceptées" },
  { value: "REJECTED", label: "Refusées" },
  { value: "all", label: "Toutes" },
];

export default async function ValidationFormateursPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const auth = await getAuthContext();
  // Les finances n'ont jamais accès aux dossiers de candidature.
  if (!auth?.user.adminRole || !["MODERATION", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const status = TABS.some((t) => t.value === sp.status) ? sp.status! : "SUBMITTED";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [result, stats] = await Promise.all([
    listApplications({
      status: status === "all" ? undefined : (status as TrainerApplicationStatus),
      page,
      pageSize: PAGE_SIZE,
    }),
    getApplicationStats(),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const href = (target: string, targetPage = 1) =>
    `/admin/validation-formateurs?status=${target}${targetPage > 1 ? `&page=${targetPage}` : ""}`;

  return (
    <>
      <AdminHead
        title="Validation des formateurs"
        lead="Les dossiers les plus anciens en premier : on traite dans l'ordre d'arrivée."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile tone="blue" value={stats.submitted} label="dossiers à traiter" />
        <StatTile tone="gold" value={stats.resubmissionPending} label="en attente du candidat" />
        <StatTile tone="brand" value={stats.approved} label="formateurs acceptés" />
        <StatTile tone="clay" value={stats.rejected} label="dossiers refusés" />
      </div>

      <nav aria-label="Filtrer par statut" className="mb-5">
        <ul className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1">
          {TABS.map((tab) => (
            <li key={tab.value}>
              <Link
                href={href(tab.value)}
                aria-current={tab.value === status ? "page" : undefined}
                className={
                  tab.value === status
                    ? "block whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-paper"
                    : "block whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-bold text-ink-2 hover:text-ink"
                }
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <AdminCard title={`${result.total} dossier${result.total > 1 ? "s" : ""}`}>
        {result.items.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="Rien à traiter ici"
            description="Aucun dossier dans cet état pour le moment."
          />
        ) : (
          <ul className="flex flex-col">
            {result.items.map((application) => {
              const state = APPLICATION_STATUS[application.status];
              const name = application.user.fullName ?? application.user.email;
              return (
                <li
                  key={application.id}
                  className="flex flex-wrap items-center gap-4 border-b border-line-2 py-3.5 last:border-b-0"
                >
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-bold">{name}</b>
                    <small className="block truncate text-[13px] text-ink-3">
                      {application.user.email}
                      {application.domains.length ? ` · ${application.domains.join(", ")}` : ""}
                    </small>
                  </div>
                  <StPill tone={state.tone}>{state.label}</StPill>
                  <span className="text-[13px] text-ink-2">
                    {application.submittedAt
                      ? `Soumis le ${fmtDate(application.submittedAt)}`
                      : `Créé le ${fmtDate(application.createdAt)}`}
                  </span>
                  <BtnLink
                    href={`/admin/validation-formateurs/${application.id}`}
                    variant="o"
                    size="sm"
                  >
                      <BadgeCheck aria-hidden="true" />
                      Examiner
                  </BtnLink>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label="Pagination des dossiers" className="flex justify-center gap-2 pt-5">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={href(status, p)}
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
    </>
  );
}
