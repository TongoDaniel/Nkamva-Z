import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StPill } from "@/components/nk/status-pill";
import { getAuthContext } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import {
  probeIntegrations,
  countByState,
  type EnvVarStatus,
  type Integration,
  type IntegrationCheck,
  type IntegrationState,
} from "@/lib/integrations";
import { RefreshButton } from "./refresh-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Intégrations",
  robots: { index: false },
};

/**
 * Le libellé porte l'information, jamais la seule couleur : « configuré » et
 * « vérifié » ne sont pas le même état, et c'est toute la raison de cet écran.
 */
const STATE_LABELS: Record<IntegrationState, string> = {
  ok: "Vérifié",
  warn: "Vérifié, avec réserve",
  absent: "Non configuré",
  down: "En échec",
};

const STATE_TONES: Record<IntegrationState, "ok" | "warn" | "bad" | "muted"> = {
  ok: "ok",
  warn: "warn",
  absent: "muted",
  down: "bad",
};

const REQUIREMENT_LABELS: Record<EnvVarStatus["requirement"], string> = {
  required: "requise",
  production: "requise en production",
  optional: "facultative",
};

function CheckRow({ check }: { check: IntegrationCheck }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0">
      <dt className="w-full shrink-0 text-[13.5px] font-bold text-ink sm:w-[200px]">
        {check.label}
      </dt>
      <dd className="min-w-0 flex-1">
        <StPill tone={STATE_TONES[check.state]}>{STATE_LABELS[check.state]}</StPill>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{check.detail}</p>
      </dd>
    </div>
  );
}

function EnvRow({ variable }: { variable: EnvVarStatus }) {
  // Une facultative absente est un défaut assumé, pas un manque : elle reste en
  // gris. Une requise absente est la panne elle-même.
  const tone =
    variable.present
      ? "ok"
      : variable.requirement === "optional"
        ? "muted"
        : variable.requirement === "production"
          ? "warn"
          : "bad";

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line-2 py-2 last:border-b-0">
      <code className="w-full shrink-0 font-mono text-[13px] text-ink-2 sm:w-[260px]">
        {variable.name}
      </code>
      <StPill tone={tone}>{variable.present ? "posée" : "absente"}</StPill>
      <span className="text-[13px] text-ink-3">{REQUIREMENT_LABELS[variable.requirement]}</span>
      {variable.note ? (
        <span className="w-full text-[13px] leading-relaxed text-ink-3 sm:w-auto sm:flex-1">
          {variable.note}
        </span>
      ) : null}
    </div>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  return (
    <AdminCard
      title={integration.name}
      action={
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-ink-3">{integration.elapsedMs} ms</span>
          <StPill tone={STATE_TONES[integration.state]}>
            {STATE_LABELS[integration.state]}
          </StPill>
        </div>
      }
    >
      <p className="mb-4 text-[13px] leading-relaxed text-ink-2">{integration.purpose}</p>

      <dl>
        {integration.checks.map((check) => (
          <CheckRow key={check.label} check={check} />
        ))}
      </dl>

      <p className="mb-1 mt-5 text-[13px] font-bold uppercase tracking-wide text-ink-3">
        Variables lues
      </p>
      <div>
        {integration.env.map((variable) => (
          <EnvRow key={variable.name} variable={variable} />
        ))}
      </div>

      <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        <b className="font-extrabold text-ink">Sans lui :</b> {integration.whenAbsent}
      </p>
    </AdminCard>
  );
}

export default async function IntegrationsPage() {
  const auth = await getAuthContext();
  // Cet écran nomme les variables d'environnement du déploiement et le mode
  // réel de chaque fournisseur. Ce n'est ni une affaire de finances ni de
  // modération : il reste au Super-admin, comme les paramètres (décision 7).
  if (auth?.user.adminRole !== "SUPER_ADMIN") redirect("/admin");

  const report = await probeIntegrations();
  const counts = countByState(report.integrations);
  const total = report.integrations.length;

  return (
    <>
      <AdminHead
        title="Intégrations"
        lead="« La variable est posée » ne veut pas dire « ça marche ». Chaque ligne ci-dessous vient d'un appel réel au fournisseur, fait à l'instant, jamais d'une simple lecture de la configuration."
        actions={<RefreshButton />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-nk-lg border border-line bg-card px-5 py-4 shadow-nk-sm">
        <p className="text-[14.5px] font-extrabold">
          {counts.ok}/{total} au vert
        </p>
        {counts.down > 0 ? (
          <StPill tone="bad">{counts.down} en échec</StPill>
        ) : null}
        {counts.absent > 0 ? (
          <StPill tone="muted">{counts.absent} non configuré{counts.absent > 1 ? "s" : ""}</StPill>
        ) : null}
        {counts.warn > 0 ? (
          <StPill tone="warn">
            {counts.warn} avec réserve
          </StPill>
        ) : null}
        <span className="text-[13px] text-ink-3">Sondé le {fmtDateTime(report.probedAt)}</span>
      </div>

      {report.paymentSimulation.declared ? (
        <p
          role="alert"
          className={
            report.paymentSimulation.active
              ? "mb-6 rounded-nk-lg border border-danger/30 bg-danger/5 px-5 py-4 text-[13px] leading-relaxed text-ink"
              : "mb-6 rounded-nk-lg border border-line bg-card border-l-4 border-l-gold px-5 py-4 text-[13px] leading-relaxed text-gold-ink rounded-l-sm"
          }
        >
          <b className="font-extrabold">Simulation de paiement :</b>{" "}
          {report.paymentSimulation.detail}
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {report.integrations.map((integration) => (
          <IntegrationCard key={integration.key} integration={integration} />
        ))}
      </div>

      <p className="mt-5 flex items-start gap-2 text-[13px] leading-relaxed text-ink-3">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Aucune sonde n&apos;écrit ni ne facture : elles lisent un solde, une
        configuration, une liste. Aucune valeur de secret ne traverse cet écran : la
        présence d&apos;une variable est rendue, jamais son contenu, et les messages
        d&apos;erreur du fournisseur sont expurgés avant affichage. Les sondes qui
        écrivent (dont le droit de créer un direct chez Mux, qui ne se vérifie
        qu&apos;en ouvrant un flux facturable) restent dans{" "}
        <code className="font-mono text-[13px]">scripts/probe-integrations.ts</code>,
        lancé à la main.
      </p>
    </>
  );
}
