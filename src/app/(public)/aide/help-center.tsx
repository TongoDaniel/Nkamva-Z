"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import {
  CreditCard,
  Play,
  Plus,
  Search,
  SearchX,
  Shield,
  UserCog,
  Users,
} from "lucide-react";
import { Btn } from "@/components/nk/button";
import { PillInput } from "@/components/nk/input";
import { EmptyState } from "@/components/nk/empty-state";
import { COMMISSION_LABEL, TRAINER_SHARE_LABEL } from "@/lib/commission";
import { cn } from "@/lib/utils";

export interface HelpItem {
  q: string;
  a: string;
}

export interface HelpGroup {
  id: string;
  title: string;
  hint: string;
  icon: React.ReactNode;
  items: HelpItem[];
}

/**
 * Contenu de l'aide. Les réponses décrivent le produit tel qu'il est réellement
 * implémenté : la fenêtre de contestation vient de `DISPUTE_OPENING_WINDOW_DAYS`
 * et du seuil de consommation de `src/lib/disputes.ts`, le taux de commission
 * de `lib/commission`.
 *
 * L'abonnement formateur, lui, n'est pas une constante : c'est une grille datée
 * que l'administration modifie. `subscription` porte la phrase construite par
 * `subscriptionAnnouncement` à partir des tarifs en vigueur — l'aide affirmait
 * « ni abonnement pour publier » pendant que la facturation prélevait.
 */
function buildGroups(subscription: string): HelpGroup[] {
  return [
    {
      id: "demarrer",
      title: "Démarrer",
      hint: "Créer un compte, premiers pas",
      icon: <Play />,
      items: [
        {
          q: "Comment créer un compte sur NkamVa ?",
          a: "Cliquez sur « S'inscrire », renseignez votre email et un mot de passe. Un code à six chiffres vous est envoyé pour vérifier l'adresse. La création d'un compte apprenant est gratuite et immédiate : aucun abonnement plateforme n'est requis.",
        },
        {
          q: "NkamVa est-il gratuit ?",
          a: `Oui pour les apprenants : le compte ne coûte rien et vous ne payez que les ressources que vous achetez à l'unité. Côté formateur, NkamVa retient ${COMMISSION_LABEL} sur chaque vente. ${subscription}`,
        },
        {
          q: "Faut-il un ordinateur pour suivre une ressource ?",
          a: "Non. Le site est pensé pour le mobile d'abord : la lecture, la progression et vos achats vous suivent d'un appareil à l'autre dès que vous êtes connecté au même compte.",
        },
      ],
    },
    {
      id: "paiements",
      title: "Paiements",
      hint: "Mobile money, FCFA, remboursements",
      icon: <CreditCard />,
      items: [
        {
          q: "Quels moyens de paiement acceptez-vous ?",
          a: "Le mobile money — Orange Money, MTN MoMo, Wave, Airtel Money, M-Pesa — et la carte bancaire. Les opérateurs proposés dépendent de votre pays. Les prix sont affichés en FCFA et vous payez le montant exact indiqué sur la fiche.",
        },
        {
          q: "Le paiement mobile money est-il sécurisé ?",
          a: "Oui. Les transactions passent par un prestataire de paiement certifié ; NkamVa ne voit ni ne conserve jamais votre code secret mobile money.",
        },
        {
          q: "Mon paiement est « en attente », que faire ?",
          a: "En mobile money, la confirmation de l'opérateur prend parfois quelques minutes. L'écran de confirmation se met à jour tout seul, et la ressource apparaît dans votre espace dès que le paiement est validé. Vous pouvez fermer la page sans risque : rien n'est perdu.",
        },
        {
          q: "Combien de temps ai-je accès à une ressource achetée ?",
          a: "À vie. Une ressource achetée reste dans « Mes ressources », avec votre progression, sur mobile comme sur ordinateur.",
        },
        {
          q: "Puis-je être remboursé ?",
          a: "Dans les 14 jours suivant l'achat, si vous avez consulté moins de 30 % de la ressource. Une ressource téléchargeable qui a été téléchargée ne peut plus être remboursée : le fichier est chez vous.",
        },
        {
          q: "Comment contester un achat ?",
          a: "Depuis « Mes achats », le bouton « Contester » sur la ligne concernée. L'écran vous dit immédiatement si l'achat ouvre droit à remboursement, avant même que vous ne rédigiez quoi que ce soit.",
        },
        {
          q: "Que se passe-t-il pendant l'examen d'une contestation ?",
          a: "Votre accès à la ressource est suspendu le temps de l'instruction, et la part correspondante du formateur est gelée. Si la contestation n'est pas retenue, l'accès vous est rendu.",
        },
        {
          q: "Combien de temps une contestation prend-elle ?",
          a: "L'équipe examine les dossiers dans leur ordre d'arrivée. Si une précision vous est demandée, vous disposez de 7 jours pour répondre ; sans réponse, le dossier se clôt et votre accès est rétabli.",
        },
      ],
    },
    {
      id: "communautes",
      title: "Communautés",
      hint: "Rejoindre, participer, résilier",
      icon: <Users />,
      items: [
        {
          q: "Comment rejoindre une communauté ?",
          a: "Depuis la fiche d'une communauté, « Rejoindre la communauté », puis réglez le prix d'intégration mensuel fixé par le formateur. Vous accédez alors au forum, aux ressources partagées et aux lives de la communauté.",
        },
        {
          q: "Puis-je annuler mon abonnement à une communauté ?",
          a: "Oui, à tout moment depuis votre espace. La résiliation prend effet à la fin de la période déjà payée : vous conservez l'accès jusque-là, sans remboursement au prorata.",
        },
        {
          q: "Une communauté remplace-t-elle l'achat des ressources ?",
          a: "Non, les deux sont indépendants. Une ressource achetée à l'unité reste à vous même si vous quittez la communauté ; les ressources partagées dans une communauté, elles, ne sont accessibles que tant que vous en êtes membre.",
        },
      ],
    },
    {
      id: "compte",
      title: "Mon compte",
      hint: "Mot de passe, données, suppression",
      icon: <UserCog />,
      items: [
        {
          q: "Comment changer mon mot de passe ?",
          a: "Depuis « Profil et paramètres », onglet Sécurité. Le changement déconnecte toutes vos sessions ouvertes, y compris celle en cours : c'est voulu.",
        },
        {
          q: "J'ai oublié mon mot de passe, comment faire ?",
          a: "Depuis l'écran de connexion, « Mot de passe oublié ». Un lien de réinitialisation vous est envoyé par email ; si l'adresse n'existe pas chez nous, l'écran affiche le même message — nous ne révélons pas quels emails ont un compte.",
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
      title: "Espace formateur",
      hint: "Publier, vendre, être payé",
      icon: <Shield />,
      items: [
        {
          q: "Comment devenir formateur ?",
          a: "Déposez une candidature depuis « Devenir formateur » : une présentation, une pièce d'identité, un diplôme ou une attestation, et deux minutes de vidéo. Chaque dossier est examiné par notre équipe avant la première publication.",
        },
        {
          q: "Combien NkamVa retient-il ?",
          a: `${COMMISSION_LABEL} du prix de vente. Les ${TRAINER_SHARE_LABEL} restants vous reviennent et sont crédités à chaque vente confirmée. Il n'y a pas de frais d'entrée. ${subscription}`,
        },
        {
          q: "Comment retirer mes revenus ?",
          a: "Chaque vente confirmée crédite votre solde, consultable depuis votre tableau de bord. Les retraits vers mobile money ouvriront avec le parcours de vérification d'identité, actuellement en construction.",
        },
        {
          q: "Un acheteur conteste ma ressource, que puis-je faire ?",
          a: "Depuis « Litiges » dans votre espace formateur, vous pouvez transmettre des éléments à l'équipe de modération. Le motif détaillé rédigé par l'acheteur et son identité ne vous sont pas communiqués.",
        },
      ],
    },
  ];
}

const QUICK_TAGS = ["Mobile money", "Remboursement", "Mot de passe", "Devenir formateur"];

/** Insensible à la casse et aux accents : « resilier » doit trouver « résilier ». */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function HelpCenter({
  subscription,
  responseHours,
}: {
  subscription: string;
  responseHours: number;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  // Identifiant littéral plutôt que `useId` : voir `components/nk/faq.tsx`.
  const panelId = "aide-reponse";

  const groups = React.useMemo(() => buildGroups(subscription), [subscription]);

  const needle = fold(query.trim());
  const filtered = React.useMemo(() => {
    if (!needle) return groups;
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => fold(`${item.q} ${item.a}`).includes(needle)),
    })).filter((group) => group.items.length > 0);
  }, [needle, groups]);

  const total = filtered.reduce((sum, group) => sum + group.items.length, 0);

  const goToGroup = (id: string) => {
    // Le groupe peut être masqué par une recherche en cours : `flushSync` le
    // remet dans le DOM avant qu'on ne cherche à l'atteindre. Un `rAF` suffirait
    // en apparence, mais il ne s'exécute pas dans un onglet qui ne peint pas.
    flushSync(() => setQuery(""));
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="mx-auto max-w-[720px] pb-2 pt-12 text-center">
        <h1 className="mb-3 text-[clamp(28px,3.8vw,42px)] font-extrabold leading-[1.06] text-balance">
          Comment pouvons-nous vous aider ?
        </h1>
        <p className="mx-auto max-w-[56ch] text-base leading-[1.55] text-ink-2 text-pretty">
          Trouvez des réponses sur les paiements, les remboursements, les communautés et l&apos;espace
          formateur.
        </p>

        <div className="mt-7">
          <label htmlFor="aide-recherche" className="sr-only">
            Rechercher dans l&apos;aide
          </label>
          <PillInput
            id="aide-recherche"
            type="search"
            icon={<Search />}
            placeholder="Rechercher : paiement mobile money, remboursement, mot de passe…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-3.5 flex flex-wrap justify-center gap-2">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setQuery(tag)}
                className="cursor-pointer rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 transition hover:border-brand hover:text-brand"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <nav aria-label="Thèmes de l'aide" className="mt-10">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {groups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => goToGroup(group.id)}
                className="h-full w-full cursor-pointer rounded-nk border border-line bg-card p-5 text-left shadow-nk-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-brand-tint-2 hover:shadow-nk"
              >
                <span
                  className="mb-3.5 grid size-11 place-items-center rounded-[14px] bg-brand-tint text-brand [&_svg]:size-[21px]"
                  aria-hidden="true"
                >
                  {group.icon}
                </span>
                <span className="block text-[16px] font-extrabold text-ink">{group.title}</span>
                <span className="mt-1 block text-[13px] leading-snug text-ink-2">{group.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="aide-faq" className="mx-auto mt-14 max-w-[780px]">
        <h2
          id="aide-faq"
          className="mb-6 text-center text-[clamp(22px,3vw,30px)] font-extrabold"
        >
          Questions fréquentes
        </h2>

        <p className="sr-only" aria-live="polite">
          {needle
            ? `${total} question${total > 1 ? "s" : ""} pour « ${query.trim()} »`
            : `${total} questions au total`}
        </p>

        {total === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title="Aucune réponse ne correspond"
            description={`Essayez un autre mot, ou écrivez-nous : nous répondons sous ${responseHours} heures ouvrées.`}
            action={
              <Btn variant="o" onClick={() => setQuery("")}>
                Effacer la recherche
              </Btn>
            }
          />
        ) : (
          filtered.map((group) => (
            <div key={group.id} id={group.id} className="mb-9 scroll-mt-24">
              <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.1em] text-ink-3">
                {group.title}
              </p>
              {group.items.map((item) => {
                const key = `${group.id}:${item.q}`;
                const isOpen = open === key;
                const itemPanelId = `${panelId}-${group.id}-${group.items.indexOf(item)}`;
                return (
                  <div
                    key={item.q}
                    className={cn(
                      "mb-3 overflow-hidden rounded-nk border bg-card transition-colors duration-200",
                      isOpen ? "border-brand-tint-2" : "border-line",
                    )}
                  >
                    <h3>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : key)}
                        aria-expanded={isOpen}
                        aria-controls={itemPanelId}
                        className="flex w-full cursor-pointer items-center justify-between gap-4 px-[22px] py-[19px] text-left font-sans text-[15.5px] font-bold text-ink hover:text-brand"
                      >
                        {item.q}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-[30px] flex-none place-items-center rounded-full transition-[transform,background-color] duration-300",
                            isOpen ? "rotate-45 bg-brand-tint text-brand" : "bg-line-2 text-ink-2",
                          )}
                        >
                          <Plus className="size-[15px]" />
                        </span>
                      </button>
                    </h3>
                    <div
                      id={itemPanelId}
                      className={cn(
                        "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.3,.7,.3,1)]",
                        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div className="overflow-hidden">
                        <p className="px-[22px] pb-5 text-[14.5px] leading-[1.65] text-ink-2">
                          {item.a}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </section>

      <section className="mx-auto mt-4 max-w-[780px] rounded-nk-lg bg-gradient-to-r from-navy to-navy-2 px-8 py-9 text-center text-white">
        <h2 className="text-[22px] font-extrabold">Vous n&apos;avez pas trouvé votre réponse ?</h2>
        <p className="mx-auto mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-[#b9c9dd]">
          Écrivez au support : nous répondons en français sous {responseHours} heures ouvrées.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Btn asChild variant="light">
            <Link href="/contact">Contacter le support</Link>
          </Btn>
          <Btn asChild variant="gh">
            <Link href="/communautes">Demander à la communauté</Link>
          </Btn>
        </div>
      </section>
    </>
  );
}
