import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { StatTile } from "@/components/nk/stat-tile";
import { Btn } from "@/components/nk/button";
import { getAuthContext } from "@/lib/api";
import { getApplicationStats } from "@/lib/trainer-application-review";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false },
};

const MODERATION_ROLES = ["MODERATION", "SUPER_ADMIN"];

export default async function AdminHomePage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  const canModerate =
    !!auth.user.adminRole && MODERATION_ROLES.includes(auth.user.adminRole);
  const stats = canModerate ? await getApplicationStats() : null;

  return (
    <>
      <AdminHead
        title="Administration"
        lead={`Vous êtes connecté avec le sous-rôle ${auth.user.adminRole ?? "non défini"}.`}
      />

      {canModerate && stats ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile tone="blue" value={stats.submitted} label="candidatures à traiter" />
            <StatTile tone="gold" value={stats.resubmissionPending} label="en attente du candidat" />
            <StatTile tone="brand" value={stats.approved} label="formateurs acceptés" />
            <StatTile tone="clay" value={stats.rejected} label="dossiers refusés" />
          </div>

          <AdminCard
            title="Validation des formateurs"
            action={
              <Btn asChild size="sm">
                <Link href="/admin/validation-formateurs">
                  <BadgeCheck aria-hidden="true" />
                  Ouvrir la file
                </Link>
              </Btn>
            }
          >
            <p className="text-[14px] leading-relaxed text-ink-2">
              {stats.submitted > 0
                ? `${stats.submitted} dossier${stats.submitted > 1 ? "s" : ""} attend${stats.submitted > 1 ? "ent" : ""} votre examen.`
                : "Aucun dossier en attente d'examen."}
            </p>
          </AdminCard>
        </>
      ) : (
        <AdminCard title="Accès">
          <p className="text-[14px] leading-relaxed text-ink-2">
            Votre sous-rôle ne donne pas accès à la validation des formateurs. Les rubriques
            finances, utilisateurs et système seront livrées avec leurs lots respectifs.
          </p>
        </AdminCard>
      )}

      <p className="mt-6 rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
        Les autres rubriques de la navigation ne sont pas encore construites : elles arriveront
        avec les lots litiges, KYC et retraits.
      </p>
    </>
  );
}
