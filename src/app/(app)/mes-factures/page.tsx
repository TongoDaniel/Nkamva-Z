import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { Btn } from "@/components/nk/button";
import { StPill } from "@/components/nk/status-pill";
import { DataTable, type Column } from "@/components/nk/data-table";
import { getAuthContext } from "@/lib/api";
import { listMyInvoices } from "@/lib/invoices";
import { fmtDate, fmtFcfa } from "@/lib/format";
import { routesOf } from "@/lib/spaces";

const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes factures",
  robots: { index: false },
};

/**
 * Écran des factures — le maillon qui manquait.
 *
 * `issueInvoiceQuietly()` émet une facture après chaque achat encaissé depuis le
 * Lot 0, `renderInvoicePdf()` sait la rendre en PDF, et les deux routes
 * existaient : aucun écran n'y menait. Des pièces comptables étaient donc
 * numérotées sans trou, pour personne.
 *
 * Le PDF n'est pas stocké — il est regénéré à la demande par
 * `/api/me/invoices/<id>?pdf=1`. C'est le seul lien de cet écran qui sorte vers
 * l'API : une facture se télécharge, elle ne se rend pas dans une page.
 */
type Invoice = Awaited<ReturnType<typeof listMyInvoices>>[number];

const KIND: Record<string, { label: string; tone: "ok" | "info" }> = {
  PURCHASE: { label: "Achat", tone: "ok" },
  SUBSCRIPTION: { label: "Abonnement", tone: "info" },
};

export default async function MesFacturesPage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  const invoices = await listMyInvoices(auth.user.id);

  const columns: Column<Invoice>[] = [
    {
      key: "number",
      header: "Numéro",
      width: "170px",
      cell: (row) => (
        <span className="font-mono text-[13px] font-bold text-ink">{row.number}</span>
      ),
    },
    {
      key: "label",
      header: "Objet",
      cell: (row) => (
        <span className="block min-w-0 truncate text-sm font-semibold text-ink">{row.label}</span>
      ),
    },
    {
      key: "kind",
      header: "Type",
      width: "140px",
      hideOnMobile: true,
      cell: (row) => {
        const kind = KIND[row.kind] ?? { label: row.kind, tone: "info" as const };
        return <StPill tone={kind.tone}>{kind.label}</StPill>;
      },
    },
    {
      key: "issuedAt",
      header: "Émise le",
      width: "150px",
      hideOnMobile: true,
      cell: (row) => <span className="text-[13.5px] text-ink-2">{fmtDate(row.issuedAt)}</span>,
    },
    {
      key: "amount",
      header: "Montant",
      width: "130px",
      align: "right",
      cell: (row) => (
        <b className="whitespace-nowrap text-sm font-extrabold">{fmtFcfa(row.amountFcfa)}</b>
      ),
    },
    {
      key: "pdf",
      header: <span className="sr-only">Télécharger</span>,
      width: "120px",
      align: "right",
      // Une ancre nue, et non un `Link` : la réponse porte un
      // `content-disposition: attachment`, donc c'est un téléchargement, pas une
      // navigation. Le routeur client, lui, essaierait de rendre la page.
      cell: (row) => (
        <a
          href={`/api/me/invoices/${row.id}?pdf=1`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
        >
          <Download className="size-3.5 shrink-0" aria-hidden="true" />
          PDF
          <span className="sr-only"> de la facture {row.number}</span>
        </a>
      ),
    },
  ];

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title="Mes factures"
        lead="Chaque paiement encaissé émet une facture numérotée. Elle est figée à l'émission : un changement de tarif ne réécrit jamais une pièce déjà émise."
        actions={
          <Btn asChild variant="o">
            <Link href="/mes-achats">Mes achats</Link>
          </Btn>
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<FileText />}
          title="Aucune facture"
          description="Vos factures apparaîtront ici dès votre premier paiement encaissé."
          action={
            <Btn asChild>
              <Link href={routes.catalog}>Découvrir le catalogue</Link>
            </Btn>
          }
        />
      ) : (
        <div className="mt-6 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm sm:p-6">
          <DataTable
            caption={`Vos ${invoices.length} facture${invoices.length > 1 ? "s" : ""}`}
            columns={columns}
            rows={invoices}
            getRowKey={(row) => row.id}
          />
          <p className="mt-5 text-[12.5px] leading-relaxed text-ink-3">
            Les cent dernières factures sont listées. Le PDF est regénéré à chaque
            téléchargement plutôt que conservé : aucune de ses données ne peut bouger, deux
            rendus donnent la même pièce.
          </p>
        </div>
      )}
    </div>
  );
}
