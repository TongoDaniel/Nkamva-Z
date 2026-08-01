import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/nk/page-head";
import { Btn } from "@/components/nk/button";

export const metadata: Metadata = {
  title: "Centre d'aide",
  description:
    "Achat, accès, remboursement, compte, publication : les réponses aux questions courantes sur NkamVa.",
};

const SECTIONS = [
  {
    id: "achat",
    title: "Acheter une ressource",
    items: [
      {
        q: "Comment payer ?",
        a: "Par mobile money — Orange Money, MTN MoMo, Wave, Airtel Money, M-Pesa — ou par carte bancaire. Les prix sont affichés en FCFA et vous payez le montant exact indiqué sur la fiche.",
      },
      {
        q: "Mon paiement est « en attente », que faire ?",
        a: "En mobile money, la confirmation de l'opérateur prend parfois quelques minutes. L'écran de confirmation se met à jour tout seul, et la ressource apparaît dans votre espace dès que le paiement est validé. Vous pouvez fermer la page sans risque : rien n'est perdu.",
      },
      {
        q: "Combien de temps ai-je accès à une ressource achetée ?",
        a: "À vie. Une ressource achetée reste dans « Mes ressources », avec votre progression, sur mobile comme sur ordinateur.",
      },
    ],
  },
  {
    id: "remboursement",
    title: "Remboursements et contestations",
    items: [
      {
        q: "Dans quels cas puis-je être remboursé ?",
        a: "Dans les 14 jours suivant l'achat, si vous avez consulté moins de 30 % de la ressource. Une ressource téléchargeable qui a été téléchargée ne peut plus être remboursée : le fichier est chez vous.",
      },
      {
        q: "Comment contester un achat ?",
        a: "Depuis « Mes achats », le bouton « Contester » sur la ligne concernée. L'écran vous dit immédiatement si l'achat ouvre droit à remboursement, avant même que vous ne rédigiez quoi que ce soit.",
      },
      {
        q: "Que se passe-t-il pendant l'examen ?",
        a: "Votre accès à la ressource est suspendu le temps de l'instruction, et la part correspondante du formateur est gelée. Si la contestation n'est pas retenue, l'accès vous est rendu.",
      },
      {
        q: "Combien de temps cela prend-il ?",
        a: "L'équipe examine les dossiers dans leur ordre d'arrivée. Si une précision vous est demandée, vous disposez de 7 jours pour répondre ; sans réponse, le dossier se clôt et votre accès est rétabli.",
      },
    ],
  },
  {
    id: "compte",
    title: "Mon compte",
    items: [
      {
        q: "Comment changer mon mot de passe ?",
        a: "Depuis « Profil et paramètres », onglet Sécurité. Le changement déconnecte toutes vos sessions ouvertes, y compris celle en cours : c'est voulu.",
      },
      {
        q: "Comment récupérer mes données ?",
        a: "Onglet « Mes données » de votre profil : un fichier JSON contenant votre profil, vos achats, votre progression et vos notifications est produit à la demande.",
      },
      {
        q: "Comment supprimer mon compte ?",
        a: "Même onglet. La suppression est différée de 30 jours, pendant lesquels vous pouvez l'annuler vous-même. Vos achats sont ensuite conservés de façon anonymisée : la comptabilité l'impose.",
      },
    ],
  },
  {
    id: "formateur",
    title: "Publier sur NkamVa",
    items: [
      {
        q: "Comment devenir formateur ?",
        a: "Déposez une candidature depuis « Devenir formateur » : une présentation, une pièce d'identité, un diplôme ou une attestation, et deux minutes de vidéo. Chaque dossier est examiné avant publication.",
      },
      {
        q: "Combien NkamVa retient-il ?",
        a: "15 % du prix de vente. Les 85 % restants vous reviennent, et sont crédités à chaque vente confirmée.",
      },
      {
        q: "Un acheteur conteste ma ressource, que puis-je faire ?",
        a: "Depuis « Litiges » dans votre espace formateur, vous pouvez transmettre des éléments à l'équipe de modération. Le motif détaillé rédigé par l'acheteur et son identité ne vous sont pas communiqués.",
      },
    ],
  },
];

export default function AidePage() {
  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Aide" }]}
        title="Centre d'aide"
        lead="Les réponses aux questions les plus fréquentes. Si la vôtre n'y figure pas, écrivez-nous."
        actions={
          <Btn asChild variant="o">
            <Link href="/contact">Nous écrire</Link>
          </Btn>
        }
      />

      <nav aria-label="Sections de l'aide" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block rounded-full border border-line bg-card px-4 py-2 text-[13.5px] font-semibold text-ink-2 hover:border-ink-3 hover:text-ink"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto mt-8 max-w-[760px]">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mb-10 scroll-mt-24">
            <h2 className="mb-4 text-[22px] font-extrabold">{section.title}</h2>
            {section.items.map((item) => (
              <details
                key={item.q}
                className="group mb-3 overflow-hidden rounded-nk border border-line bg-card open:border-brand-tint-2"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4.5 text-[15.5px] font-bold hover:text-brand">
                  {item.q}
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-line-2 text-ink-2 transition group-open:rotate-45 group-open:bg-brand-tint group-open:text-brand"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-3.5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-ink-2">{item.a}</p>
              </details>
            ))}
          </section>
        ))}

        <p className="rounded-nk-lg border border-line bg-card px-5 py-4.5 text-[14px] leading-relaxed text-ink-2 shadow-nk-sm">
          Votre question n&apos;a pas de réponse ici ?{" "}
          <Link href="/contact" className="font-bold text-brand hover:text-brand-dark">
            Écrivez au support
          </Link>{" "}
          — nous répondons sous 24 heures ouvrées.
        </p>
      </div>
    </div>
  );
}
