import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { EmptyState } from "@/components/nk/empty-state";
import { Btn } from "@/components/nk/button";
import { TrainerDirectory } from "./trainer-directory";
import { listPublicTrainers } from "@/lib/trainers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nos formateurs",
  description:
    "Les formateurs africains qui publient sur NkamVa : leur domaine, leur expérience et leurs ressources.",
};

export default async function FormateursPage() {
  // Une base injoignable ne doit pas renvoyer une 500 sur une page publique :
  // on distingue « aucun formateur publié » de « liste indisponible », les deux
  // états ne demandant pas la même chose au visiteur.
  let trainers: Awaited<ReturnType<typeof listPublicTrainers>> = [];
  let unavailable = false;
  try {
    trainers = await listPublicTrainers();
  } catch (error) {
    console.error("[FORMATEURS] listPublicTrainers a échoué", error);
    unavailable = true;
  }

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Formateurs" }]}
        title="Nos formateurs"
        lead="Celles et ceux qui publient sur NkamVa. Chaque profil a été examiné avant sa première publication."
        actions={
          <Btn asChild variant="o">
            <Link href="/devenir-formateur">Devenir formateur</Link>
          </Btn>
        }
      />

      {unavailable ? (
        <EmptyState
          className="mt-6"
          icon={<Users />}
          title="La liste des formateurs est momentanément indisponible"
          description="Le service ne répond pas pour l'instant. Le catalogue, lui, reste consultable."
          action={
            <Btn asChild variant="o">
              <Link href="/ressources">Voir le catalogue</Link>
            </Btn>
          }
        />
      ) : trainers.length === 0 ? (
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
        <TrainerDirectory trainers={trainers} />
      )}

      <p className="mt-8 rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
        Les fiches formateur détaillées, avec l&apos;ensemble de leurs publications, arriveront
        avec le catalogue par auteur. En attendant, chaque ressource du catalogue indique son
        formateur.
      </p>
    </div>
  );
}
