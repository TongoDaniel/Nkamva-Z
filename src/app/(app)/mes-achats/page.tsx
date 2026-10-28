import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, BookOpen, Download, Users, Wallet } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { BtnLink } from "@/components/nk/button-link";
import { StPill } from "@/components/nk/status-pill";
import { StatTile } from "@/components/nk/stat-tile";
import { DataTable, type Column } from "@/components/nk/data-table";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { getAuthContext } from "@/lib/api";
import { listMyPurchases, getPurchaseSummary } from "@/lib/purchases";
import { db } from "@/lib/db";
import { DisputeButton } from "./dispute-button";
import { fmtDate, fmtFcfa } from "@/lib/format";
import type { PaymentStatus, PurchaseItem } from "@/lib/dto";
import { routesOf } from "@/lib/spaces";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes achats",
  robots: { index: false },
};

const PAGE_SIZE = 20;

const STATUS: Record<PaymentStatus, { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }> = {
  SUCCEEDED: { label: "Payé", tone: "ok" },
  PENDING: { label: "En attente", tone: "warn" },
  FAILED: { label: "Échoué", tone: "bad" },
  CANCELED: { label: "Annulé", tone: "muted" },
  REFUNDED: { label: "Remboursé", tone: "info" },
  DISPUTED: { label: "En litige", tone: "bad" },
};

const PROVIDERS: Record<string, string> = {
  PAWAPAY: "Mobile money",
  STRIPE: "Carte bancaire",
};

export default async function MesAchatsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const [result, summary] = await Promise.all([
    listMyPurchases(auth.user.id, page, PAGE_SIZE),
    getPurchaseSummary(auth.user.id),
  ]);
  const items = result.items as unknown as PurchaseItem[];

  // Un achat déjà contesté ne propose plus le bouton : le dossier existe.
  const disputed = new Set(
    (
      await db.dispute.findMany({
        where: { learnerId: auth.user.id, purchaseId: { in: items.map((p) => p.id) } },
        select: { purchaseId: true },
      })
    ).map((d) => d.purchaseId),
  );

  // La facture n'existe que pour un achat encaissé, et son émission peut avoir
  // échoué sans faire échouer l'achat (`issueInvoiceQuietly`) : on lit ce qui
  // existe réellement plutôt que de le déduire du statut. Une ligne sans facture
  // ne propose donc pas un lien qui rendrait 404.
  const invoiceByPurchase = new Map(
    (
      await db.invoice.findMany({
        where: { userId: auth.user.id, purchaseId: { in: items.map((p) => p.id) } },
        select: { id: true, purchaseId: true, number: true },
      })
    ).map((invoice) => [invoice.purchaseId, invoice]),
  );
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const columns: Column<PurchaseItem>[] = [
    {
      key: "course",
      header: "Ressource",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-nk-sm border border-line bg-card text-brand"
            aria-hidden="true"
          >
            <FormatGlyph format={row.course?.format} className="size-4" />
          </span>
          <div className="min-w-0">
            <b className="block truncate text-sm font-bold">
              {row.course ? (
                <Link href={routes.course(row.course.slug)} className="text-ink hover:text-brand">
                  {row.course.title}
                </Link>
              ) : (
                "Ressource retirée du catalogue"
              )}
            </b>
            <small className="block text-[13px] text-ink-3">
              {formatLabel(row.course?.format)}
            </small>
          </div>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      width: "170px",
      hideOnMobile: true,
      cell: (row) => <span className="text-[13.5px] text-ink-2">{fmtDate(row.createdAt)}</span>,
    },
    {
      key: "provider",
      header: "Moyen",
      width: "150px",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-[13.5px] text-ink-2">{PROVIDERS[row.provider] ?? row.provider}</span>
      ),
    },
    {
      key: "status",
      header: "Statut",
      width: "140px",
      cell: (row) => {
        const status = STATUS[row.providerStatus] ?? STATUS.PENDING;
        return (
          <span className="flex flex-col gap-1">
            <StPill tone={status.tone}>{status.label}</StPill>
            {row.accessSuspended ? (
              <StPill tone="bad">Accès suspendu</StPill>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "amount",
      header: "Montant",
      width: "130px",
      align: "right",
      cell: (row) => <b className="whitespace-nowrap text-sm font-extrabold">{fmtFcfa(row.amountFcfa)}</b>,
    },
    {
      key: "invoice",
      header: "Facture",
      width: "110px",
      hideOnMobile: true,
      // Ancre nue : la réponse porte un `content-disposition: attachment`, donc
      // c'est un téléchargement et non une navigation.
      cell: (row) => {
        const invoice = invoiceByPurchase.get(row.id);
        return invoice ? (
          <a
            href={`/api/me/invoices/${invoice.id}?pdf=1`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
          >
            <Download className="size-3.5 shrink-0" aria-hidden="true" />
            PDF
            <span className="sr-only"> de la facture {invoice.number}</span>
          </a>
        ) : (
          <span className="text-[13px] text-ink-3">—</span>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      width: "130px",
      align: "right",
      cell: (row) =>
        // Contestable tant que l'achat est encaissé, non remboursé, et sans
        // dossier déjà ouvert. Le délai et la consommation sont vérifiés à
        // l'ouverture de la fenêtre, par l'API.
        row.providerStatus === "SUCCEEDED" && !row.refundedAt && !disputed.has(row.id) ? (
          <DisputeButton
            purchaseId={row.id}
            courseTitle={row.course?.title ?? "cette ressource"}
          />
        ) : disputed.has(row.id) ? (
          <Link href="/mes-litiges" className="text-[13px] font-semibold text-brand">
            Voir le dossier
          </Link>
        ) : null,
    },
  ];

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        title="Mes achats"
        lead="L'historique de vos paiements : ressources achetées à l'unité et abonnements à vos communautés."
        // Pas de « Voir mes ressources » ici : la barre de navigation porte
        // déjà « Mes ressources ». Restent les deux écrans qui n'ont pas
        // d'entrée à eux et dont les achats sont le point d'entrée.
        actions={
          <>
            <BtnLink href="/mes-factures" variant="o">Mes factures</BtnLink>
            <BtnLink href="/mes-litiges" variant="o">Mes contestations</BtnLink>
          </>
        }
      />

      {result.total > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatTile
            icon={<Wallet />}
            value={fmtFcfa(summary.totalPaidFcfa)}
            label="total payé"
          />
          <StatTile
            icon={<BookOpen />}
            value={summary.coursesCount}
            label={`ressource${summary.coursesCount > 1 ? "s" : ""} achetée${summary.coursesCount > 1 ? "s" : ""}`}
            tone="blue"
          />
          <StatTile
            icon={<Users />}
            value={summary.activeSubscriptions}
            label={`abonnement${summary.activeSubscriptions > 1 ? "s" : ""} actif${summary.activeSubscriptions > 1 ? "s" : ""}`}
            tone="gold"
          />
        </div>
      ) : null}

      {result.total === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Receipt />}
          title="Aucun achat pour l'instant"
          description="Vos paiements apparaîtront ici, avec leur statut et leur montant."
          action={
            <BtnLink href={routes.catalog}>Découvrir le catalogue</BtnLink>
          }
        />
      ) : (
        <div className="mt-6 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm sm:p-6">
          <DataTable
            caption={`Historique de vos achats, page ${page} sur ${pages}`}
            columns={columns}
            rows={items}
            getRowKey={(row) => row.id}
          />
          {pages > 1 ? (
            <nav aria-label="Pagination des achats" className="mt-5 flex justify-center gap-2">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={p === 1 ? "/mes-achats" : `/mes-achats?page=${p}`}
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
        </div>
      )}
    </div>
  );
}
