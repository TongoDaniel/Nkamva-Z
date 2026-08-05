import { redirect } from "next/navigation";
import { AdminShell } from "@/components/layouts/admin-shell";
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
  //
  // Seul le **nombre** traverse la frontière. La navigation, elle, ne peut pas
  // être lue ici : `ADMIN_NAV` est exporté par un module client, et ce qu'un
  // composant serveur en reçoit n'est pas le tableau mais une référence opaque.
  // Le décor de la pastille et le filtrage par sous-rôle (décision 7) sont donc
  // tous deux appliqués par `AdminShell`, là où les icônes existent vraiment.
  let pendingApplications = 0;
  if (auth.user.adminRole && MODERATION_ROLES.includes(auth.user.adminRole)) {
    const stats = await getApplicationStats();
    pendingApplications = stats.submitted;
  }

  return (
    <AdminShell
      pendingApplications={pendingApplications}
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
