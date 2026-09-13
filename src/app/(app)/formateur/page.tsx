import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { BtnLink } from "@/components/nk/button-link";
import { Hint } from "@/components/nk/hint";
import { StatStrip } from "@/components/nk/stat-strip";
import { StPill } from "@/components/nk/status-pill";
import { FormatGlyph, formatLabel } from "@/components/nk/cover";
import { getAuthContext } from "@/lib/api";
import { listMyResources } from "@/lib/access";
import { searchCourses } from "@/lib/catalog";
import { listAgenda } from "@/lib/lives";
import { visualsOfMember } from "@/lib/community-visual";
import { trendingSessions } from "@/lib/trending";
import { loadTrainerPanel } from "@/lib/trainer-home";
import { getTrainerVisibility } from "@/lib/trainers";
import { PAYOUT_MIN_AMOUNT_FCFA } from "@/lib/payouts";
import { db } from "@/lib/db";
import { fmtFcfa, fmtNumber, fmtDate } from "@/lib/format";
import { routesOf } from "@/lib/spaces";
import type { CourseListItem, ResourceItem } from "@/lib/dto";
import { COURSE_STATUS } from "./ressources/course-status";
import { TRAINER_SECTIONS } from "./sections";
import { VisibilityNotice } from "./visibility-notice";
import { walletTileLabel } from "./wallet-label";
import {
  BANNER_TONES,
  buildEventItems,
  Novelties,
  ResumeList,
  StepRow,
  TaskRow,
  s,
  type StateBanner,
  type Task,
} from "../accueil/blocs";
import { UpcomingEvents } from "../accueil/upcoming-events";

/** Espace connecté : les liens de navigation restent dans la coquille applicative. */
const routes = routesOf("app");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace formateur",
  robots: { index: false },
};

/**
 * L'accueil d'un formateur.
 * ==========================================================================
 * C'était `/accueil` qui portait ce tableau de bord, dans une branche choisie
 * selon le rôle — et `/formateur` en tenait un second, plus maigre, avec les
 * mêmes tuiles et les mêmes publications. Deux écrans pour un seul poste de
 * travail. La barre du bas a tranché : cinq cases, une seule pour l'accueil,
 * qui mène ici. `/accueil` redirige désormais un formateur vers cette page.
 *
 * Ce que l'écran garde de chacun : les bandeaux d'état, la file « À traiter »
 * et le régime de démarrage viennent de l'ancien accueil ; la grille « Gérer
 * votre activité », l'avis de visibilité et le rappel sur le solde viennent de
 * l'ancien `/formateur`. Rien n'a été perdu au passage.
 * ==========================================================================
 */
export default async function FormateurPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth?.user.trainerId) return null;
  const trainerId = auth.user.trainerId;
  const userId = auth.user.id;

  // Le middleware renvoie ici quand un compte non-admin tente d'ouvrir `/admin`.
  // Sans ce message, la redirection ressemble à un clic perdu.
  const { erreur } = await searchParams;

  // Tout part en une seule vague : ce qui coûte face à une base distante n'est
  // pas le nombre de requêtes, c'est la profondeur de cascade.
  const [trainer, agenda, mine, suggestions, profile, visibility, visuals, trendingLives] = await Promise.all([
    loadTrainerPanel(trainerId, userId),
    listAgenda(userId, trainerId),
    listMyResources(userId, "all", 1, 20),
    // Six et non trois : ses propres publications sont retirées plus bas, et un
    // filtre appliqué après la pagination viderait la rangée.
    searchCourses({ sort: "newest", page: 1, pageSize: 6 }),
    db.user.findUnique({
      where: { id: userId },
      select: { fullName: true, preferredName: true },
    }),
    getTrainerVisibility(trainerId),
    // Arbitrage 142 — le bloc Événements, comme sur l'accueil apprenant. Les
    // visuels couvrent la communauté qu'il anime et celles qu'il suit, dans la
    // même vague que l'agenda.
    visualsOfMember(userId, trainerId),
    trendingSessions({ viewerId: userId }),
  ]);
  const events = await buildEventItems({ agenda, visuals, trending: trendingLives });

  // La maquette accueille par le prénom. `preferredName` prime quand il existe ;
  // sinon on prend le premier mot du nom complet, faute de champ dédié.
  const firstName =
    profile?.preferredName?.trim() || profile?.fullName?.trim().split(/\s+/)[0] || null;

  const items = mine.items as unknown as ResourceItem[];
  const inProgress = items.filter((i) => i.isStarted && !i.accessSuspended).slice(0, 3);
  const suggested = (suggestions.items as unknown as CourseListItem[])
    .filter((c) => !items.some((i) => i.course?.id === c.id))
    // Un formateur voyait sa propre ressource proposée à l'achat parmi les
    // nouveautés : le filtre ci-dessus écarte ce qu'il a **acheté**, pas ce
    // qu'il a **publié**.
    .filter((c) => c.trainerProfile.id !== trainerId)
    .slice(0, 3);

  const accessDenied =
    erreur === "acces-refuse" ? (
      <p
        role="alert"
        className="mb-8 rounded-nk border border-danger/30 bg-danger-tint px-5 py-4 text-[14px] font-semibold leading-relaxed text-danger"
      >
        Vous n&apos;avez pas les droits nécessaires pour accéder à cette page.
      </p>
    ) : null;

  const { overview, wallet, subscription, storage, activeMembers, disputesToContest, unreadMessages, courses, sales } =
    trainer;

  // Deux états refusent l'écriture (décision 68 et arbitrage 5) : proposer
  // « Publier » mènerait alors droit à un refus.
  const canWrite =
    subscription?.subscriptionStatus !== "SUSPENDED" &&
    subscription?.subscriptionStatus !== "CANCELED";

  // --- Bandeaux, par priorité décroissante ---
  const banners: StateBanner[] = [];
  if (subscription?.subscriptionStatus === "CANCELED") {
    banners.push({
      key: "canceled",
      tone: "muted",
      title: "Votre espace est en état de solde",
      detail:
        "Vous ne publiez plus et n'animez plus. Il reste ouvert pour retirer votre solde, suivre vos litiges et consulter vos factures.",
      href: "/formateur/abonnement",
      cta: "Mon abonnement",
    });
  } else if (subscription?.subscriptionStatus === "SUSPENDED") {
    banners.push({
      key: "suspended",
      tone: "danger",
      title: "Abonnement suspendu — vos ressources sont retirées du catalogue",
      detail:
        "Celles et ceux qui les ont achetées y accèdent toujours. Le règlement de l'échéance les remet en vente.",
      href: "/formateur/abonnement",
      cta: "Régler",
    });
  }
  if (wallet.negativeSince) {
    banners.push({
      key: "negative",
      tone: "danger",
      title: "Votre solde est négatif",
      detail: `Depuis le ${fmtDate(wallet.negativeSince)}. Aucun retrait n'est possible tant qu'il n'est pas revenu à l'équilibre.`,
      href: "/formateur/portefeuille",
      cta: "Portefeuille",
    });
  }
  if (subscription?.subscriptionStatus === "PAST_DUE") {
    banners.push({
      key: "past-due",
      tone: "gold",
      title: `Échéance à régler — ${fmtFcfa(subscription.dueTotalFcfa)}`,
      detail: subscription.suspensionAt
        ? `Vos ressources restent en vente jusqu'au ${fmtDate(subscription.suspensionAt)}.`
        : "Vos ressources restent en vente pour l'instant.",
      href: "/formateur/abonnement",
      cta: "Régler",
    });
  }
  if (storage.quotaBytes > 0 && storage.usedBytes / storage.quotaBytes >= 0.9) {
    banners.push({
      key: "storage",
      tone: "clay",
      title: "Votre stockage est presque plein",
      detail: `${Math.round((storage.usedBytes / storage.quotaBytes) * 100)} % du quota est occupé. Au-delà, aucun téléversement ne passe.`,
      href: "/formateur/portefeuille",
      cta: "Ajouter un palier",
    });
  }
  const shownBanners = banners.slice(0, 2);

  // --- Files à traiter ---
  const tasks: Task[] = [];
  if (overview.draftCount > 0) {
    tasks.push({
      key: "drafts",
      label: `${overview.draftCount} brouillon${s(overview.draftCount)} à publier`,
      detail: "Ils ne sont visibles de personne tant qu'ils ne sont pas publiés.",
      href: "/formateur/ressources",
    });
  }
  if (disputesToContest > 0) {
    tasks.push({
      key: "disputes",
      label: `${disputesToContest} litige${s(disputesToContest)} sans contestation`,
      detail: "La modération décidera sans votre version tant que vous n'aurez rien déposé.",
      href: "/formateur/litiges",
    });
  }
  if (wallet.withdrawableFcfa >= PAYOUT_MIN_AMOUNT_FCFA) {
    tasks.push({
      key: "payout",
      label: `${fmtFcfa(wallet.withdrawableFcfa)} retirables`,
      detail: "Au-dessus du minimum de retrait. Le virement passe par un compte vérifié.",
      href: "/formateur/portefeuille",
    });
  }
  if (unreadMessages > 0) {
    tasks.push({
      key: "messages",
      label: `${unreadMessages} message${s(unreadMessages)} non lu${s(unreadMessages)}`,
      detail: "Des apprenants attendent une réponse.",
      href: "/messagerie",
    });
  }

  // Régime de démarrage : aucune ressource publiée. Une rangée de zéros ne dit
  // rien à qui n'a pas encore commencé — la liste des étapes, si.
  const starting = overview.publishedCount === 0;

  // --- Vos publications : les mieux vendues, plus le brouillon le plus récent ---
  const ranked = [...courses]
    .map((c) => ({
      course: c,
      salesCount: sales.get(c.id)?.salesCount ?? 0,
      netFcfa: sales.get(c.id)?.netRevenueFcfa ?? 0,
    }))
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, 3);
  // `listTrainerCourses` trie par création décroissante : le premier brouillon
  // rencontré est le plus récent.
  const latestDraft = courses.find((c) => c.status === "draft");
  const shownCourses =
    latestDraft && !ranked.some((r) => r.course.id === latestDraft.id)
      ? [...ranked, { course: latestDraft, salesCount: 0, netFcfa: 0 }]
      : ranked;
  const maxSales = Math.max(1, ...shownCourses.map((r) => r.salesCount));

  const lead =
    tasks.length === 0
      ? "Rien ne vous attend aujourd'hui."
      : tasks.length === 1
        ? "Une chose vous attend aujourd'hui."
        : `${tasks.length} choses vous attendent aujourd'hui.`;

  return (
    <div className="nk-wrap pb-10 sm:pb-16">
      <PageHead
        title={firstName ? `Bonjour, ${firstName} !` : "Votre espace"}
        lead={lead}
        /* Le bouton ne paraît pas pendant le régime de démarrage : l'encart
           « Vos premiers pas » ouvre déjà la même page à sa première ligne, et
           l'en-tête de l'espace porte un « + » qui y mène aussi. Trois portes
           pour un geste, dont deux à 40 px l'une de l'autre, sur l'écran où la
           place manque le plus. Il revient dès que l'encart cède la place aux
           chiffres. */
        actions={
          canWrite && !starting ? (
            <BtnLink href="/formateur/ressources/nouvelle">
              <Plus aria-hidden="true" />
              Publier une ressource
            </BtnLink>
          ) : null
        }
      />

      {accessDenied}

      {/* Avant les chiffres : un formateur invisible des visiteurs doit
          l'apprendre en arrivant, pas après avoir lu son solde. */}
      {visibility ? <VisibilityNotice visibility={visibility} /> : null}

      {shownBanners.length > 0 ? (
        <section aria-labelledby="etat-du-compte" className="mb-8 flex flex-col gap-3">
          <h2 id="etat-du-compte" className="sr-only">
            État de votre compte
          </h2>
          {shownBanners.map((banner) => (
            <div
              key={banner.key}
              className={`flex flex-wrap items-center gap-4 rounded-nk-lg border px-5 py-4 ${BANNER_TONES[banner.tone]}`}
            >
              <div className="min-w-0 flex-1">
                <b className="block text-[14px] font-bold">{banner.title}</b>
                <small className="block text-[13px] leading-relaxed opacity-90">{banner.detail}</small>
              </div>
              <BtnLink href={banner.href} size="sm" variant="o">
                {banner.cta}
              </BtnLink>
            </div>
          ))}
        </section>
      ) : null}

      {starting ? (
        <section
          aria-labelledby="demarrage"
          className="mb-8 rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm"
        >
          {/* Le titre porte son ⓘ (arbitrage 138) : pourquoi il n'y a pas
              encore de chiffres se lit une fois, et rendait deux lignes avant
              la première étape. */}
          <div className="mb-3 flex items-center gap-1.5">
            <h2 id="demarrage" className="text-[17px] font-bold">
              Vos premiers pas
            </h2>
            <Hint label="Pourquoi il n'y a pas encore de chiffres">
              Vos chiffres apparaîtront ici dès votre première publication.
            </Hint>
          </div>
          <ul className="flex flex-col">
            <StepRow
              done={overview.courseCount > 0}
              label="Créer une ressource"
              detail="Vous fixez le format, le contenu et le prix, en FCFA."
              href="/formateur/ressources/nouvelle"
            />
            <StepRow
              done={overview.publishedCount > 0}
              label="La publier au catalogue"
              detail="Un brouillon n'est visible de personne tant qu'il n'est pas publié."
              href="/formateur/ressources"
            />
            <StepRow
              done={activeMembers > 0}
              label="Accueillir votre premier membre"
              detail="Le salon d'abonnés, ses invitations et ses réglages."
              href="/formateur/communaute"
            />
          </ul>
        </section>
      ) : (
        // Quatre chiffres dans une bande : empilés une par ligne sous `sm`, ils
        // repoussaient « À traiter » — la seule section qui demande une
        // décision — sous la ligne de flottaison d'un téléphone.
        <StatStrip
          className="mb-5 sm:mb-8"
          items={[
            {
              label: `vente${s(overview.salesCount)} confirmée${s(overview.salesCount)}`,
              value: fmtNumber(overview.salesCount),
            },
            {
              label: "revenus nets cumulés",
              value: fmtNumber(overview.netRevenueFcfa),
              suffix: "FCFA",
            },
            {
              label: walletTileLabel(wallet),
              value: fmtNumber(wallet.withdrawableFcfa),
              suffix: "FCFA",
            },
            {
              label: `membre${s(activeMembers)} actif${s(activeMembers)}`,
              value: fmtNumber(activeMembers),
            },
          ]}
        />
      )}

      {/* Colonne principale : l'activité de formateur, datée, donc prioritaire.
          Colonne latérale : l'apprenante, compacte mais jamais absente. */}
      <div className="grid gap-8 xl:grid-cols-3">
        <div className="flex flex-col gap-7 sm:gap-10 xl:col-span-2">
          <section aria-labelledby="a-traiter">
            <h2 id="a-traiter" className="mb-4 text-[17px] font-bold">
              À traiter
            </h2>
            {tasks.length === 0 ? (
              <p className="rounded-nk-lg border border-line bg-card px-5 py-4 text-[13px] leading-relaxed text-ink-2 shadow-nk-sm">
                Rien n&apos;attend de décision de votre part : pas de brouillon en
                souffrance, pas de litige sans réponse, pas de message non lu.
              </p>
            ) : (
              <ul className="flex flex-col rounded-nk-lg border border-line bg-card px-5 py-4.5 shadow-nk-sm">
                {tasks.map((task) => (
                  <TaskRow key={task.key} task={task} />
                ))}
              </ul>
            )}
          </section>

          {shownCourses.length > 0 ? (
            <section aria-labelledby="publications">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 id="publications" className="text-[17px] font-bold">
                  Vos publications
                </h2>
                <Link href="/formateur/ressources" className="nk-tap text-[13px] font-bold text-brand">
                  Tout gérer
                </Link>
              </div>
              <ul className="flex flex-col gap-3">
                {shownCourses.map(({ course, salesCount, netFcfa }) => {
                  const status = COURSE_STATUS[course.status] ?? COURSE_STATUS.draft;
                  return (
                    <li
                      key={course.id}
                      className="group relative flex flex-wrap items-center gap-4 rounded-nk-lg border border-line bg-card px-5 py-4 shadow-nk-sm transition duration-150 hover:border-brand hover:shadow-nk focus-within:border-brand focus-within:shadow-nk"
                    >
                      <span
                        className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand"
                        aria-hidden="true"
                      >
                        <FormatGlyph format={course.format} className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[14.5px] font-bold">
                          <Link
                            href={`/formateur/ressources/${course.id}`}
                            className="text-ink after:absolute after:inset-0 after:content-[''] group-hover:text-brand"
                          >
                            {course.title}
                          </Link>
                        </h3>
                        <p className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
                          <StPill tone={status.tone}>{status.label}</StPill>
                          <span>{formatLabel(course.format)}</span>
                          <span>{fmtFcfa(course.priceFcfa)}</span>
                        </p>
                        <div
                          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line-2"
                          aria-hidden="true"
                        >
                          <i
                            className="block h-full rounded-full bg-brand"
                            style={{ width: `${Math.round((salesCount / maxSales) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-right text-[13px] text-ink-2">
                        <b className="block font-display text-[17px] font-extrabold text-ink">
                          {fmtNumber(salesCount)}
                        </b>
                        vente{s(salesCount)} · {fmtFcfa(netFcfa)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-7 sm:gap-10">
          <section aria-labelledby="reprendre">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="reprendre" className="text-[17px] font-bold">
                Reprendre
              </h2>
              <Link href="/mes-ressources" className="nk-tap text-[13px] font-bold text-brand">
                Tout voir
              </Link>
            </div>
            {inProgress.length === 0 ? (
              <p className="rounded-nk-lg border-[1.5px] border-dashed border-line bg-card/40 px-5 py-6 text-center text-[13px] leading-relaxed text-ink-2">
                Rien en cours.{" "}
                <Link href={routes.catalog} className="font-bold text-brand">
                  Explorer le catalogue
                </Link>
              </p>
            ) : (
              <ResumeList items={inProgress} />
            )}
          </section>
        </aside>
      </div>

      {/* Pleine largeur, et non dans la colonne latérale où vivaient les deux
          « Prochains directs » : une ligne d'événement porte une date, une
          vignette, un titre et une marque, ce qu'un tiers d'écran ne tient
          pas. Rien ne s'affiche quand aucune des deux listes n'a de séance. */}
      {events.mine.length + events.trending.length > 0 ? (
        <UpcomingEvents
          mine={events.mine}
          trending={events.trending}
          hasCommunities={visuals.size > 0}
          agendaHref="/mes-lives"
          exploreHref={routes.communities}
          className="mt-7 sm:mt-10"
        />
      ) : null}

      <Novelties courses={suggested} />

      {/* Ce que l'ancien `/formateur` portait et que l'accueil n'avait pas : la
          carte des sections, et le rappel sur le solde. */}
      <section aria-labelledby="sections" className="mt-7 sm:mt-10">
        <h2 id="sections" className="mb-4 text-[17px] font-bold">
          Gérer votre activité
        </h2>
        {/*
          Deux colonnes dès le téléphone, et la phrase de description réservée
          aux écrans qui ont la place.

          Sept cartes à une colonne, chacune avec ses deux lignes d'explication,
          faisaient 873 px — un tiers de la page pour une grille de navigation
          dont les libellés se suffisent : « Mes ventes », « Portefeuille »,
          « Mes publications ». La description revient à partir de `sm`, là où
          elle ne coûte pas un écran de défilement, et c'est « Vos premiers pas »
          qui explique au formateur qui débute.
        */}
        {/*
          Plus de pastille d'icône — retirée le 12 septembre 2026 à la demande
          du propriétaire. Elle était `aria-hidden`, donc décorative par
          construction, et sept pastilles bleues alignées pesaient plus lourd à
          l'œil que les libellés qu'elles étaient censées aider à trouver. Ce
          qui distingue ces cartes, c'est leur nom, puis leur description.

          La carte n'a donc plus de boîte flex : elle n'avait de rangée que
          parce qu'il fallait poser la pastille à gauche du texte. Le libellé
          récupère les 44 px de la pastille et les 16 du gouttière, ce qui rend
          sa chaîne d'exceptions inutile — le chevron en ligne, lui, reste : il
          n'illustre pas, il annonce que la carte mène ailleurs.
        */}
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
          {TRAINER_SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="group block h-full rounded-nk-lg border border-line bg-card px-3.5 py-3.5 shadow-nk-sm transition duration-150 hover:border-brand hover:shadow-nk sm:px-5 sm:py-4"
              >
                <b className="block text-[14px] font-bold leading-snug text-ink group-hover:text-brand sm:text-[14.5px]">
                  {section.label}
                  <ChevronRight
                    className="ml-1 inline-block size-4 align-[-3px] text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
                    aria-hidden="true"
                  />
                </b>
                <span className="mt-1 hidden text-[13px] leading-relaxed text-ink-2 sm:block">
                  {section.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/*
        Ici vivait un renvoi vers « Mes ventes » et « Portefeuille », avec la
        règle du solde en trois lignes — 167 px. Retiré le 12 septembre 2026 :
        **ses deux liens sont deux cartes de la grille juste au-dessus**, et sa
        règle est déjà écrite en tête du portefeuille (« le solde est crédité à
        chaque vente réellement encaissée ») et dans le ⓘ du score de
        confiance. Un troisième exemplaire ne disait rien de plus et coûtait un
        cinquième de l'écran. Ne pas le réintroduire : si la règle doit se lire
        d'ici, c'est la description de la carte « Portefeuille » qui la porte.
      */}
    </div>
  );
}
