import { redirect } from "next/navigation";
import { AppShell } from "@/components/layouts/app-shell";
import { getAuthContext } from "@/lib/api";
import { db } from "@/lib/db";
import { countUnreadMessages } from "@/lib/messaging";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Doublon volontaire du middleware : si la garde de navigation est un jour
  // désactivée, aucune page de l'espace connecté ne doit rester accessible.
  //
  // Vers `/auth/deconnexion` et non `/auth/connexion` : arriver ici avec une
  // session vide veut dire que le middleware a jugé le cookie bon alors qu'il ne
  // l'est plus (compte suspendu ou supprimé en cours de session). L'envoyer vers
  // la connexion le ferait renvoyer ici par le middleware, en boucle. Il faut
  // d'abord retirer le cookie — cf. `src/app/auth/deconnexion/route.ts`.
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/deconnexion");

  // Même raison que le doublon ci-dessus, appliquée au cloisonnement de
  // l'administration : le middleware travaille sur une liste de préfixes, qui
  // ne peut que prendre du retard sur les routes réellement présentes ici.
  // Cette garde-ci les couvre toutes, y compris celles qui n'existent pas
  // encore. Voir `src/lib/roles.ts` pour la règle et son motif.
  if (auth.user.role === "ADMIN") redirect("/admin");

  // Le nom complet n'est pas dans le JWT : la topbar le lit ici plutôt que de
  // se rabattre sur la partie locale de l'adresse e-mail.
  const [profile, unreadMessages, openApplication] = await Promise.all([
    db.user.findUnique({
      where: { id: auth.user.id },
      select: { fullName: true, preferredName: true },
    }),
    countUnreadMessages(auth.user.id, auth.user.trainerId),
    // Le menu du compte porte une entrée vers le dossier tant qu'il en reste un
    // à suivre. On ne peut pas le déduire du rôle : `PENDING_TRAINER` ne couvre
    // que le dossier envoyé, pas le brouillon commencé et abandonné en route.
    //
    // `APPROVED` en fait partie, et c'est le cas qui compte le plus : un dossier
    // accepté dont l'abonnement n'est pas réglé n'a pas encore d'espace, et
    // c'est depuis cet écran qu'on le paie. L'absence de `trainerId` suffit à
    // distinguer les deux — un formateur en exercice n'est pas interrogé.
    auth.user.trainerId
      ? null
      : db.trainerApplication.findFirst({
          where: {
            userId: auth.user.id,
            status: { in: ["DRAFT", "SUBMITTED", "RESUBMISSION_PENDING", "APPROVED"] },
          },
          select: { id: true },
        }),
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
        hasOpenApplication: openApplication !== null,
      }}
    >
      {children}
    </AppShell>
  );
}
