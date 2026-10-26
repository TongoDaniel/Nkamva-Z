import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminHead } from "@/components/layouts/admin-shell";
import { getAuthContext } from "@/lib/api";
import { listHelpForAdmin, loadHelpValues } from "@/lib/help-content";
import { HelpEditor } from "./help-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Aide & FAQ" };

/** Qui rédige l'aide : le Super-admin et la Modération, pas les Finances. */
const EDITOR_ROLES = ["SUPER_ADMIN", "MODERATION"];

export default async function AdminHelpPage() {
  const auth = await getAuthContext();
  if (!auth?.user.adminRole || !EDITOR_ROLES.includes(auth.user.adminRole)) redirect("/admin");

  const [categories, values] = await Promise.all([listHelpForAdmin(), loadHelpValues()]);
  const homepageCount = categories.reduce(
    (n, c) => n + c.articles.filter((a) => a.published && a.onHomepage).length,
    0,
  );

  return (
    <>
      <AdminHead
        title="Aide & FAQ"
        lead={
          <>
            Les questions du centre d&apos;aide (/aide), et celles reprises sur la page d&apos;accueil.{" "}
            {homepageCount} question{homepageCount > 1 ? "s" : ""} publiée{homepageCount > 1 ? "s" : ""}{" "}
            sur l&apos;accueil.
          </>
        }
      />
      <HelpEditor
        categories={categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          hint: c.hint,
          icon: c.icon,
          articles: c.articles.map((a) => ({
            id: a.id,
            question: a.question,
            answer: a.answer,
            published: a.published,
            onHomepage: a.onHomepage,
          })),
        }))}
        values={values}
      />
    </>
  );
}
