import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StPill } from "@/components/nk/status-pill";
import { canOpen } from "@/lib/admin-roles";
import { getAuthContext } from "@/lib/api";
import { getCustomerCard } from "@/lib/customer-card";
import { REASON_LABELS } from "@/lib/disputes";
import { fmtDate, fmtFcfa } from "@/lib/format";
import { PLAN_LABELS } from "@/lib/trainer-plans";
import { RecheckButton } from "./recheck-button";
import { FounderToggle } from "./founder-toggle";
import { hasAdminRole } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fiche client", robots: { index: false } };

const PROVIDER_LABELS: Record<string, string> = { PAWAPAY: "Mobile money", STRIPE: "Carte" };

export default async function ClientCardPage({ params }: { params: Promise<{ userId: string }> }) {
  const auth = await getAuthContext();
  if (!canOpen(auth?.user, "customers")) redirect("/admin");
  const { userId } = await params;
  const card = await getCustomerCard(userId);
  if (!card) notFound();
  const { user, purchases, disputes, invoices } = card;

  return (
    <>
      <Link href="/admin/clients" className="mb-4 inline-block text-[13px] font-bold text-ink-2 hover:text-ink">
        ← Autre client
      </Link>
      <AdminHead
        title={user.fullName ?? user.email}
        actions={
          user.trainerProfile && hasAdminRole(auth?.user, "SUPER_ADMIN") ? (
            <FounderToggle trainerId={user.trainerProfile.id} founder={user.trainerProfile.founder} />
          ) : undefined
        }
        lead={
          <span className="flex flex-wrap items-center gap-2.5">
            <span>{user.email}</span>
            {user.phone ? <span>· {user.phone}</span> : null}
            <span>· inscrit le {fmtDate(user.createdAt)}</span>
            {user.emailVerifiedAt ? <StPill tone="ok">Adresse vérifiée</StPill> : <StPill tone="warn">Adresse non vérifiée</StPill>}
            {user.suspendedAt ? <StPill tone="bad">Compte suspendu</StPill> : null}
            {user.trainerProfile ? (
              <StPill tone="info">
                Formateur · {PLAN_LABELS[user.trainerProfile.plan]}
                {user.trainerProfile.founder ? " · fondateur" : ""}
              </StPill>
            ) : null}
          </span>
        }
      />

      <div className="grid gap-5">
        <AdminCard title={`Achats (${purchases.length})`}>
          {purchases.length === 0 ? (
            <p className="text-[14px] text-ink-2">Aucun achat.</p>
          ) : (
            <ul className="flex flex-col">
              {purchases.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start gap-3 border-b border-line-2 py-3.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <b className="block text-sm">{p.course?.title ?? p.community?.name ?? "Achat"}</b>
                    <small className="block text-[13px] text-ink-3">
                      {fmtDate(p.createdAt)} · {PROVIDER_LABELS[p.provider] ?? p.provider} · prix {fmtFcfa(p.amountFcfa)}
                      {p.buyerFeeFcfa ? ` + frais ${fmtFcfa(p.buyerFeeFcfa)} = ${fmtFcfa(p.totalPaidFcfa)}` : ""}
                      {p.failureCode ? ` · motif fournisseur : ${p.failureCode}` : ""}
                    </small>
                    <small className="mt-1 block text-[13px] text-ink-2">{p.access.hint}</small>
                  </div>
                  <StPill tone={p.access.tone}>{p.access.label}</StPill>
                  {p.providerStatus === "PENDING" && p.providerTransactionId ? (
                    <RecheckButton purchaseId={p.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard title={`Litiges (${disputes.length})`}>
          {disputes.length === 0 ? (
            <p className="text-[14px] text-ink-2">Aucun litige.</p>
          ) : (
            <ul className="flex flex-col">
              {disputes.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 border-b border-line-2 py-3 last:border-b-0">
                  <Link href={`/admin/litiges/${d.id}`} className="min-w-0 flex-1 text-sm font-bold hover:underline">
                    {d.purchase.course?.title ?? d.purchase.community?.name ?? "Achat"} · {REASON_LABELS[d.reason]}
                  </Link>
                  <span className="text-[13px] text-ink-2">
                    {fmtDate(d.openedAt)} · {fmtFcfa(d.disputedAmountFcfa)}
                  </span>
                  {d.abuseReview ? <StPill tone="bad">Examen manuel</StPill> : null}
                  <StPill tone="muted">{d.status}</StPill>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard title={`Reçus (${invoices.length})`}>
          {invoices.length === 0 ? (
            <p className="text-[14px] text-ink-2">Aucun reçu émis.</p>
          ) : (
            <ul className="flex flex-col">
              {invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap gap-3 border-b border-line-2 py-2.5 text-[13.5px] last:border-b-0">
                  <b>{i.number}</b>
                  <span className="min-w-0 flex-1 text-ink-2">{i.label}</span>
                  <span>
                    {fmtFcfa(i.amountFcfa)}
                    {i.feeFcfa ? ` + ${fmtFcfa(i.feeFcfa)} de frais` : ""}
                  </span>
                  <span className="text-ink-3">{fmtDate(i.issuedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </>
  );
}
