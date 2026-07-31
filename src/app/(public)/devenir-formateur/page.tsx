import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";

export const metadata: Metadata = {
  title: "Devenir formateur",
  description:
    "Publiez vos guides, cours vidéo et modèles sur NkamVa, et vendez-les à votre prix, en FCFA.",
};

const ARGUMENTS = [
  ["Vous fixez vos prix", "Chaque ressource est vendue à l'unité, au tarif que vous décidez, en FCFA."],
  ["Formats libres", "PDF, vidéo, kits, modèles Notion ou tableurs — publiez ce qui sert vraiment vos apprenants."],
  ["Retraits par mobile money", "Suivez vos ventes depuis votre espace et retirez vos revenus."],
  ["Votre audience vous suit", "Vos acheteurs gardent un accès à vie : votre catalogue travaille pour vous."],
];

export default function DevenirFormateurPage() {
  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Devenir formateur" }]}
        title={
          <>
            Votre expertise a de la valeur.{" "}
            <em className="not-italic text-brand">Vendez-la.</em>
          </>
        }
        lead="Vous maîtrisez un sujet ? Transformez-le en guides, cours vidéo ou modèles, et vendez-les à votre prix sur NkamVa."
      />

      <div className="grid items-start gap-8 pt-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
          <h2 className="mb-5 text-[22px] font-extrabold">Ce que NkamVa vous apporte</h2>
          <dl className="grid gap-5 sm:grid-cols-2">
            {ARGUMENTS.map(([title, body]) => (
              <div key={title} className="flex gap-3">
                <span
                  className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-tint text-brand"
                  aria-hidden="true"
                >
                  <Check className="size-3.5" />
                </span>
                <div>
                  <dt className="mb-1 font-bold">{title}</dt>
                  <dd className="text-sm leading-relaxed text-ink-2">{body}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <aside
          aria-labelledby="candidature"
          className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm"
        >
          <Chip tone="gold">Bientôt</Chip>
          <h2 id="candidature" className="mb-2 mt-3 text-[19px] font-extrabold">
            Les candidatures ouvrent prochainement
          </h2>
          <p className="mb-5 text-[14.5px] leading-relaxed text-ink-2">
            Le dépôt de candidature en ligne — pièce d&apos;identité, diplôme, vidéo de
            présentation — n&apos;est pas encore ouvert. Chaque profil est examiné avant
            publication, et nous préférons ne pas collecter vos documents avant que ce parcours
            soit complet.
          </p>
          <p className="mb-6 rounded-xl bg-brand-tint px-4 py-3 text-[13px] leading-relaxed text-brand-dark">
            Vos coordonnées bancaires ne sont jamais demandées à l&apos;inscription : elles ne
            servent qu&apos;au moment de votre premier retrait.
          </p>
          <Btn asChild block>
            <Link href="/contact">Faire part de votre intérêt</Link>
          </Btn>
          <Btn asChild variant="o" block className="mt-2.5">
            <Link href="/ressources">Voir ce qui se publie déjà</Link>
          </Btn>
        </aside>
      </div>
    </div>
  );
}
