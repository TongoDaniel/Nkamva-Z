import { redirect } from "next/navigation";
import { AdminShell, ADMIN_NAV, type AdminNavGroup } from "@/components/layouts/admin-shell";
import { getAuthContext } from "@/lib/api";
import { db } from "@/lib/db";
import { getApplicationStats } from "@/lib/trainer-application-review";

export const dynamic = "force-dynamic";

/** Sous-rôles autorisés à voir la file de validation des formateurs. */
const MODERATION_ROLES = ["MODERATION", "SUPER_ADMIN"];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/connexion");
  if (auth.user.role !== "ADMIN") redirect("/accueil");

  const profile = await db.user.findUnique({
    where: { id: auth.user.id },
    select: { fullName: true, preferredName: true },
  });

  // Le compteur de dossiers à traiter n'a de sens que pour la modération ;
  // les finances n'ont aucun accès à ces dossiers.
  // Le filtrage par sous-rôle (décision 7) est appliqué par `AdminShell` :
  // seul un composant client peut manipuler des icônes.
  let nav: AdminNavGroup[] = ADMIN_NAV;
  if (auth.user.adminRole && MODERATION_ROLES.includes(auth.user.adminRole)) {
    const stats = await getApplicationStats();
    const pending = stats.submitted;
    if (pending > 0) {
      nav = nav.map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.href === "/admin/validation-formateurs" ? { ...item, badge: pending } : item,
        ),
      }));
    }
  }

  return (
    <AdminShell
      nav={nav}
      user={{
        name:
          profile?.preferredName ||
          profile?.fullName ||
          auth.user.email.split("@")[0] ||
          "Administrateur",
        email: auth.user.email,
        adminRole: auth.user.adminRole,
      }}
    >
      {children}
    </AdminShell>
  );
}
