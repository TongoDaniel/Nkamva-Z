import { redirect } from "next/navigation";
import { AppShell } from "@/components/layouts/app-shell";
import { getAuthContext } from "@/lib/api";
import { db } from "@/lib/db";
import { countUnreadMessages } from "@/lib/messaging";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Doublon volontaire du middleware : si la garde de navigation est un jour
  // désactivée, aucune page de l'espace connecté ne doit rester accessible.
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/connexion");

  // Le nom complet n'est pas dans le JWT : la topbar le lit ici plutôt que de
  // se rabattre sur la partie locale de l'adresse e-mail.
  const [profile, unreadMessages] = await Promise.all([
    db.user.findUnique({
      where: { id: auth.user.id },
      select: { fullName: true, preferredName: true },
    }),
    countUnreadMessages(auth.user.id, auth.user.trainerId),
  ]);

  return (
    <AppShell
      user={{
        name:
          profile?.preferredName ||
          profile?.fullName ||
          auth.user.email.split("@")[0] ||
          "Mon compte",
        email: auth.user.email,
        isTrainer: Boolean(auth.user.trainerId),
        unreadMessages,
      }}
    >
      {children}
    </AppShell>
  );
}
