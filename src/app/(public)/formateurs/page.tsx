import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { Chip } from "@/components/nk/chip";
import { Btn } from "@/components/nk/button";
import { Avatar } from "@/components/nk/avatar";
import { listPublicTrainers } from "@/lib/trainers";
import { fmtNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Les formateurs",
  description:
    "Les formateurs africains qui publient sur NkamVa : leur domaine, leur expérience et leurs ressources.",
};

export default async function FormateursPage() {
  const trainers = await listPublicTrainers();

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Formateurs" }]}
        title="Les formateurs"
        lead="Celles et ceux qui publient sur NkamVa. Chaque profil a été examiné avant sa première publication."
        actions={
          <Btn asChild variant="o">
            <Link href="/devenir-formateur">Devenir formateur</Link>
          </Btn>
        }
      />

      {trainers.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Users />}
          title="Aucun formateur publié pour l'instant"
          description="Les premiers profils apparaîtront ici dès qu'une ressource sera mise en ligne."
          action={
            <Btn asChild>
              <Link href="/devenir-formateur">Être parmi les premiers</Link>
            </Btn>
          }
        />
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {trainers.map((trainer) => {
            const name = trainer.fullName ?? "Formateur NkamVa";
            return (
              <article
                key={trainer.id}
                className="flex flex-col rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
              >
                <div className="mb-4 flex items-center gap-3.5">
                  <Avatar name={name} size="lg" />
                  <div className="min-w-0">
                    <h2 className="truncate text-[17px] font-extrabold">{name}</h2>
                    {trainer.slogan ? (
                      <p className="truncate text-[13px] font-semibold text-ink-2">
                        {trainer.slogan}
                      </p>
                    ) : null}
                  </div>
                </div>

                {trainer.domains.length > 0 ? (
                  <ul className="mb-3.5 flex flex-wrap gap-1.5">
                    {trainer.domains.slice(0, 3).map((domain) => (
                      <li key={domain}>
                        <Chip>{domain}</Chip>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {trainer.description ? (
                  <p className="mb-4 line-clamp-3 text-[14px] leading-relaxed text-ink-2">
                    {trainer.description}
                  </p>
                ) : null}

                <dl className="mt-auto flex flex-wrap gap-x-5 gap-y-1 border-t border-line-2 pt-4 text-[12.5px] text-ink-3">
                  <div className="flex gap-1.5">
                    <dd className="font-extrabold text-ink">{trainer.publishedCount}</dd>
                    <dt>ressource{trainer.publishedCount > 1 ? "s" : ""}</dt>
                  </div>
                  {trainer.studentsCount > 0 ? (
                    <div className="flex gap-1.5">
                      <dd className="font-extrabold text-ink">
                        {fmtNumber(trainer.studentsCount)}
                      </dd>
                      <dt>apprenants</dt>
                    </div>
                  ) : null}
                  {trainer.experienceYears ? (
                    <div className="flex gap-1.5">
                      <dd className="font-extrabold text-ink">{trainer.experienceYears}</dd>
                      <dt>ans d&apos;expérience</dt>
                    </div>
                  ) : null}
                </dl>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-8 rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
        Les fiches formateur détaillées, avec l&apos;ensemble de leurs publications, arriveront
        avec le catalogue par auteur. En attendant, chaque ressource du catalogue indique son
        formateur.
      </p>
    </div>
  );
}
