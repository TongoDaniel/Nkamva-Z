import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Wallet, Undo2 } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { BtnLink } from "@/components/nk/button-link";
import { StPill } from "@/components/nk/status-pill";
import { StatStrip } from "@/components/nk/stat-strip";
import { DataTable, type Column } from "@/components/nk/data-table";
import { FormatGlyph } from "@/components/nk/cover";
import { getAuthContext } from "@/lib/api";
import { listTrainerSales, getTrainerSalesSummary, type TrainerSaleRow } from "@/lib/trainer-stats";
import { fmtDate, fmtFcfa } from "@/lib/format";
import { COMMISSION_LABEL } from "@/lib/commission";
import { routesOf } from "@/lib/spaces";

const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes ventes",
  robots: { index: false },
};

const PAGE_SIZE = 20;

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }> = {
  SUCCEEDED: { label: "Encaissée", tone: "ok" },
  PENDING: { label: "En attente", tone: "warn" },
  FAILED: { label: "Échouée", tone: "bad" },
  CANCELED: { label: "Annulée", tone: "muted" },
  REFUNDED: { label: "Remboursée", tone: "info" },
  DISPUTED: { label: "En litige", tone: "bad" },
};

const PROVIDERS: Record<string, string> = {
  PAWAPAY: "Mobile money",
  STRIPE: "Carte bancaire",
};

/**
 * L'historique des ventes du formateur (F7.11, arbitrage 125).
 *
 * Un solde global ne dit pas d'où vient l'argent. Chaque ligne porte donc les
 * trois montants — brut, commission retenue, net — pour que le formateur qui
 * voit 1 700 FCFA arriver sur une vente à 2 000 retrouve les 300 retenus sans
 * les calculer lui-même.
 *
 * Les montants viennent de l'achat, **jamais d'une division refaite ici** : ils
 * y sont figés à la vente (décision 11). Le taux affiché en tête, lui, est le
 * taux annoncé au public, lu à sa source.
 */
export default async function MesVentesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const auth = await getAuthContext();
  // La garde de rôle vit dans le layout `/formateur` : arriver ici sans profil
  // n'est pas possible, et rendre `null` évite un second renvoi.
  if (!auth?.user.trainerId) return null;

  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);

  const [result, summary] = await Promise.all([
    listTrainerSales(auth.user.trainerId, page, PAGE_SIZE),
    getTrainerSalesSummary(auth.user.trainerId),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const columns: Column<TrainerSaleRow>[] = [
    {
      key: "subject",
      header: "Vendu",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-nk-sm border border-line bg-card text-brand"
            aria-hidden="true"
          >
            {row.subject.kind === "COMMUNITY" ? (
              <Wallet className="size-4" />
            ) : (
              <FormatGlyph
                format={row.subject.kind === "COURSE" ? row.subject.format : undefined}
                className="size-4"
              />
            )}
          </span>
          <div className="min-w-0">
            <b className="block truncate text-sm font-bold">
              {row.subject.kind === "COURSE" ? (
                <Link href={routes.course(row.subject.slug)} className="text-ink hover:text-brand">
                  {row.subject.title}
                </Link>
              ) : row.subject.kind === "COMMUNITY" ? (
                row.subject.title
              ) : (
                "Contenu supprimé"
              )}
            </b>
            <small className="block text-[13px] text-ink-3">
              {row.subject.kind === "COMMUNITY" ? "Adhésion à la communauté" : "Ressource"}
            </small>
          </div>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      width: "150px",
      hideOnMobile: true,
      cell: (row) => <span className="text-[13.5px] text-ink-2">{fmtDate(row.createdAt)}</span>,
    },
    {
      key: "provider",
      header: "Moyen",
      width: "140px",
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-[13.5px] text-ink-2">{PROVIDERS[row.provider] ?? row.provider}</span>
      ),
    },
    {
      key: "status",
      header: "Statut",
      width: "150px",
      cell: (row) => {
        const status = STATUS[row.providerStatus] ?? STATUS.PENDING;
        return (
          <span className="flex flex-col items-start gap-1">
            <StPill tone={row.refundedAt ? "info" : status.tone}>
              {row.refundedAt ? "Remboursée" : status.label}
            </StPill>
            {row.disputeActive ? <StPill tone="bad">Contestée</StPill> : null}
            {row.accessSuspended && !row.refundedAt ? (
              <StPill tone="warn">Accès suspendu</StPill>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "gross",
      header: "Brut",
      width: "120px",
      align: "right",
      hideOnMobile: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-[13.5px] text-ink-2">{fmtFcfa(row.amountFcfa)}</span>
      ),
    },
    {
      key: "commission",
      header: "Commission",
      width: "140px",
      align: "right",
      hideOnMobile: true,
      // Le taux figé sur cette vente, pas celui d'aujourd'hui : c'est lui qui a
      // décidé du montant, et il doit rester lisible après un changement de
      // grille.
      cell: (row) => (
        <span className="whitespace-nowrap text-[13.5px] text-ink-2">
          −{fmtFcfa(row.platformShareFcfa)}
          <small className="ml-1 text-ink-3">{Math.round(row.commissionRate * 100)} %</small>
        </span>
      ),
    },
    {
      key: "net",
      header: "Pour vous",
      width: "140px",
      align: "right",
      cell: (row) => (
        <b className="whitespace-nowrap text-sm font-extrabold">
          {row.refundedAt ? (
            <span className="text-ink-3 line-through">{fmtFcfa(row.trainerShareFcfa)}</span>
          ) : (
            fmtFcfa(row.trainerShareFcfa)
          )}
        </b>
      ),
    },
  ];

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        crumbs={[{ label: "Espace formateur", href: "/formateur" }, { label: "Mes ventes" }]}
        title="Mes ventes"
        lead={`Chaque vente encaissée, avec le détail de ce qui vous revient. La commission de la plateforme est de ${COMMISSION_LABEL}, retenue à la vente.`}
        actions={<BtnLink href="/formateur/portefeuille" variant="o">Mon portefeuille</BtnLink>}
      />

      {result.total > 0 ? (
        // Quatre chiffres dans une bande : empilés une par ligne sous `sm`, ils
        // repoussaient le tableau des ventes — ce qu'on vient lire — d'un écran
        // entier. Et ils se lisent ensemble : brut, commission, net, c'est une
        // soustraction, pas quatre nombres indépendants.
        <StatStrip
          className="mt-5 sm:mt-6"
          items={[
            {
              label: `vente${summary.count > 1 ? "s" : ""} encaissée${summary.count > 1 ? "s" : ""}`,
              value: summary.count,
            },
            { label: "encaissé au total", value: fmtFcfa(summary.grossFcfa) },
            { label: "de commission retenue", value: fmtFcfa(summary.commissionFcfa) },
            { label: "revenus nets", value: fmtFcfa(summary.netFcfa) },
          ]}
        />
      ) : null}

      {/* Les remboursements se disent à côté du total, jamais dedans : mêlés,
          le « brut » ne correspondrait à aucune ligne du tableau. */}
      {summary.refundedCount > 0 ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-nk-lg border border-line bg-paper px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
          <Undo2 className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span>
            {summary.refundedCount} vente{summary.refundedCount > 1 ? "s" : ""} remboursée
            {summary.refundedCount > 1 ? "s" : ""}, pour {fmtFcfa(summary.refundedFcfa)}. Ce montant
            n&apos;est pas compté dans les totaux ci-dessus.
          </span>
        </p>
      ) : null}

      {result.total === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Receipt />}
          title="Aucune vente pour l'instant"
          description="Chaque achat de vos ressources ou adhésion à votre communauté apparaîtra ici, avec le détail de ce qui vous revient."
          action={<BtnLink href="/formateur/ressources">Mes publications</BtnLink>}
        />
      ) : (
        <div className="mt-6 rounded-nk-lg border border-line bg-card p-5 shadow-nk-sm sm:p-6">
          <DataTable
            caption={`Historique de vos ventes, page ${page} sur ${pages}`}
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.id}
          />
          {pages > 1 ? (
            <nav aria-label="Pagination des ventes" className="mt-5 flex justify-center gap-2">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={p === 1 ? "/formateur/ventes" : `/formateur/ventes?page=${p}`}
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
