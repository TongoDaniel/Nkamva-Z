import { notFound } from "next/navigation";
import {
  Check,
  Clock,
  Globe,
  GraduationCap,
  ListOrdered,
  ListVideo,
  PenLine,
  ShieldCheck,
  Users,
} from "lucide-react";
import { BtnLink } from "@/components/nk/button-link";
import { Chip } from "@/components/nk/chip";
import { Cover, coverImageUrl, formatLabel } from "@/components/nk/cover";
import { Price, ResourceCard } from "@/components/nk/resource-card";
import { PageHead } from "@/components/nk/page-head";
import { ReportButton } from "@/components/nk/report-button";
import { StatTile } from "@/components/nk/stat-tile";
import { initials } from "@/components/nk/avatar";
import { getPublicCourse, searchCourses } from "@/lib/catalog";
import { checkCourseAccess } from "@/lib/access";
import { getAuthContext } from "@/lib/api";
import { fmtDuration, fmtNumber } from "@/lib/format";
import { routesOf, type Space } from "@/lib/spaces";
import { trainerBio, type CourseDetail, type CourseListItem } from "@/lib/dto";

/** Fiche ressource, rendue à l'identique dans l'espace visiteur et connecté. */
export async function CourseScreen({ slug, space }: { slug: string; space: Space }) {
  const routes = routesOf(space);
  const course = (await getPublicCourse(slug)) as CourseDetail | null;
  if (!course) notFound();

  // Un visiteur connecté qui possède déjà la ressource voit l'accès, pas l'achat.
  const auth = await getAuthContext();
  const access = auth ? await checkCourseAccess(course.id, auth.user.id) : null;
  const owned = access?.granted ?? false;
  const suspended = access?.reason === "ACCESS_SUSPENDED";

  // L'auteur ne s'achète pas sa propre ressource : `initiatePurchase` le refuse
  // (`CANNOT_BUY_OWN_COURSE`). L'écran doit le dire au lieu de proposer un
  // bouton dont on sait qu'il échouera. Comparaison sur l'identifiant de
  // compte, comme la garde serveur — et non sur le profil formateur du jeton.
  const isAuthor = Boolean(auth && course.trainerProfile?.user?.id === auth.user.id);

  const related = (
    await searchCourses({ category: course.category, sort: "newest", page: 1, pageSize: 4 })
  ).items as unknown as CourseListItem[];
  const relatedOthers = related.filter((c) => c.slug !== course.slug).slice(0, 3);

  const trainer = course.trainerProfile;
  const trainerName = trainer?.user?.fullName ?? "Formateur NkamVa";
  const bio = trainerBio(trainer);
  const duration = fmtDuration(course.durationSeconds);
  const typeLabel = [formatLabel(course.format), duration].filter(Boolean).join(" · ").toUpperCase();

  // Sommaire minimal — arbitrage 4 : pas de modèle `Lesson`, donc pas de liste
  // de chapitres. `lessonsCount` et `durationSeconds` portés par `Course`
  // suffisent à annoncer le volume ; en dessous de ça, la section n'a rien à
  // dire et on ne rend pas un titre vide.
  const isVideo = course.format === "video";
  const lessonsCount = course.lessonsCount && course.lessonsCount > 0 ? course.lessonsCount : null;
  // `level` est stocké en minuscules par le formulaire formateur (« débutant »).
  const levelLabel = course.level
    ? course.level.charAt(0).toUpperCase() + course.level.slice(1)
    : null;
  const hasSummary = Boolean(lessonsCount || duration || levelLabel);

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        // Même lignée que `community-screen.tsx` : le parent propre à l'espace,
        // puis l'écran de destination sous le nom qu'il se donne lui-même. Le
        // premier maillon disait « Ressources » et pointait vers un écran
        // intitulé « Le catalogue », en sautant le parent — si bien que le
        // connecté lisait « Mes ressources › Le catalogue » sur le catalogue,
        // et « Ressources › … » sur la fiche, pour la même destination.
        crumbs={[
          routes.catalogParent,
          { label: "Le catalogue", href: routes.catalog },
          { label: course.category, href: routes.catalogCategory(course.category) },
          { label: course.title },
        ]}
        title={
          <>
            <Chip className="mb-3">{course.category}</Chip>
            <span className="block">{course.title}</span>
          </>
        }
      />

      <div className="grid items-start gap-10 pt-2 lg:grid-cols-[1fr_372px]">
        {/* Colonne principale */}
        <div className="min-w-0 lg:order-1">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-2">
            <li className="inline-flex items-center gap-2">
              <Users className="size-4 text-ink-3" aria-hidden="true" />
              {fmtNumber(trainer?.studentsCount ?? 0)} apprenants
            </li>
            <li className="inline-flex items-center gap-2">
              <Globe className="size-4 text-ink-3" aria-hidden="true" />
              {course.language === "fr" ? "Français" : course.language}
            </li>
            {duration ? (
              <li className="inline-flex items-center gap-2">
                <Clock className="size-4 text-ink-3" aria-hidden="true" />
                {duration}
              </li>
            ) : null}
          </ul>

          <div className="my-6 overflow-hidden rounded-nk-lg border border-line shadow-nk-sm">
            <Cover
              category={course.category}
              format={course.format}
              typeLabel={typeLabel}
              imageUrl={coverImageUrl(course)}
            />
          </div>

          <section className="py-8">
            <h2 className="mb-4 text-[22px] font-extrabold">À propos de cette ressource</h2>
            <p className="mb-3.5 text-[15.5px] leading-relaxed text-ink-2 text-pretty">
              {course.blurb}
            </p>
            {course.description
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className="mb-3.5 text-[15.5px] leading-relaxed text-ink-2 text-pretty">
                  {para}
                </p>
              ))}
          </section>

          {course.learnPoints?.length ? (
            <section className="border-t border-line-2 py-8">
              <h2 className="mb-4 text-[22px] font-extrabold">Ce que vous apprendrez</h2>
              <ul className="grid gap-3.5 sm:grid-cols-2 sm:gap-x-6">
                {course.learnPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-[15px] leading-snug">
                    <span
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-tint text-brand"
                      aria-hidden="true"
                    >
                      <Check className="size-3.5" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasSummary ? (
            <section className="border-t border-line-2 py-8">
              <h2 className="mb-4 text-[22px] font-extrabold">
                {isVideo ? "Programme" : "Contenu"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lessonsCount ? (
                  <StatTile
                    icon={isVideo ? <ListVideo /> : <ListOrdered />}
                    value={lessonsCount}
                    label={
                      isVideo
                        ? `leçon${lessonsCount > 1 ? "s" : ""}`
                        : `section${lessonsCount > 1 ? "s" : ""}`
                    }
                  />
                ) : null}
                {duration ? (
                  <StatTile icon={<Clock />} value={duration} label="durée totale" tone="blue" />
                ) : null}
                {levelLabel ? (
                  <StatTile
                    icon={<GraduationCap />}
                    value={levelLabel}
                    label="niveau"
                    tone="gold"
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="border-t border-line-2 py-8">
            <h2 className="mb-4 text-[22px] font-extrabold">Votre formateur</h2>
            <div className="grid gap-4.5 rounded-nk-lg border border-line bg-card p-7 sm:grid-cols-[auto_1fr]">
              <span
                className="grid size-16 shrink-0 place-items-center rounded-full bg-linear-to-br from-brand to-info text-[22px] font-extrabold text-white"
                aria-hidden="true"
              >
                {initials(trainerName)}
              </span>
              <div>
                <h3 className="text-[19px] font-extrabold">{trainerName}</h3>
                {trainer?.slogan ? (
                  <p className="mb-2.5 mt-0.5 text-sm font-semibold text-ink-2">{trainer.slogan}</p>
                ) : null}
                <p className="flex flex-wrap gap-4.5 text-[13px] font-semibold text-ink-3">
                  <span>
                    <b className="text-[14.5px] font-extrabold text-ink">
                      {fmtNumber(trainer?.studentsCount ?? 0)}
                    </b>{" "}
                    apprenants
                  </span>
                  {trainer?.ratingCount ? (
                    <span>
                      <b className="text-[14.5px] font-extrabold text-ink">
                        {trainer.ratingAverage.toFixed(1)}
                      </b>{" "}
                      / 5 ({trainer.ratingCount} avis)
                    </span>
                  ) : null}
                </p>
              </div>
              {bio ? (
                <p className="text-[14.5px] leading-relaxed text-ink-2 sm:col-span-2">{bio}</p>
              ) : null}
            </div>
          </section>
        </div>

        {/* Panneau d'achat */}
        <aside
          aria-label={isAuthor ? "Votre ressource" : "Acheter cette ressource"}
          className="overflow-hidden rounded-nk-lg border border-line bg-card shadow-nk max-lg:order-first lg:sticky lg:top-[88px] lg:order-2"
        >
          <div className="max-lg:hidden">
            <Cover
              category={course.category}
              format={course.format}
              typeLabel={typeLabel}
              imageUrl={coverImageUrl(course)}
            />
          </div>
          <div className="p-6">
            {isAuthor ? (
              <>
                <p className="mb-1">
                  <Price amountFcfa={course.priceFcfa} className="!text-[32px]" />
                </p>
                <p className="mb-4.5 flex items-start gap-2.5 rounded-xl border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                  <PenLine className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
                  <span>
                    <b className="text-ink">Vous êtes l&apos;auteur de cette ressource.</b> Vous la
                    vendez, vous ne l&apos;achetez pas : c&apos;est le prix que voient vos
                    apprenants.
                  </span>
                </p>
                <BtnLink href={`/formateur/ressources/${course.id}`} variant="o" size="lg" block>
                  Gérer cette ressource
                </BtnLink>
              </>
            ) : owned ? (
              <>
                <p className="mb-4.5 flex items-center gap-2 text-[13.5px] font-bold text-brand">
                  <Check className="size-4" aria-hidden="true" />
                  Vous possédez déjà cette ressource
                </p>
                <BtnLink href="/mes-ressources" size="lg" block>Accéder à la ressource</BtnLink>
              </>
            ) : suspended ? (
              <>
                <p className="mb-4.5 rounded-xl bg-danger-tint px-4 py-3 text-[13.5px] font-semibold text-danger">
                  L&apos;accès à cette ressource est suspendu le temps d&apos;un litige en cours.
                </p>
                <BtnLink href="/contact" variant="o" size="lg" block>Contacter le support</BtnLink>
              </>
            ) : (
              <>
                <p className="mb-1">
                  <Price amountFcfa={course.priceFcfa} className="!text-[32px]" />
                </p>
                <p className="mb-4.5 text-[13px] font-semibold text-ink-3">
                  Paiement à l&apos;unité · accès à vie
                </p>
                <BtnLink href={`/achat/${course.slug}`} size="lg" block>Acheter maintenant</BtnLink>
              </>
            )}

            {isAuthor ? null : (
              <p className="mt-4 flex items-center gap-2.5 border-t border-line-2 pt-4 text-[13px] font-semibold text-ink-2">
                <ShieldCheck className="size-4 shrink-0 text-brand" aria-hidden="true" />
                Accès immédiat après paiement
              </p>
            )}

            {course.includes?.length ? (
              <ul className="mt-4 grid gap-3 border-t border-line-2 pt-4">
                {course.includes.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-snug">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}

            {isAuthor ? null : (
              <p className="mt-4 text-xs font-semibold text-ink-3">
                Orange Money · MTN MoMo · Wave · Airtel Money · M-Pesa · carte bancaire
              </p>
            )}

            {/* Le signalement est discret et en bas : c'est une issue, pas une
                proposition. Il ouvre la file /admin/signalements, qui existait
                sans que rien ne puisse l'alimenter. */}
            <div className="mt-4 border-t border-line-2 pt-4">
              <ReportButton targetType="COURSE" targetId={course.id} name={course.title} />
            </div>
          </div>
        </aside>
      </div>

      {relatedOthers.length > 0 ? (
        <section className="pt-14" aria-labelledby="apparentees">
          <h2 id="apparentees" className="mb-6 text-[22px] font-extrabold">
            Dans la même catégorie
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {relatedOthers.map((c) => (
              <ResourceCard key={c.id} course={c} space={space} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
