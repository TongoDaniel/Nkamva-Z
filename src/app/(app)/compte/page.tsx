import type { Metadata } from "next";
import { getAuthContext } from "@/lib/api";
import { db } from "@/lib/db";
import { countUnreadMessages } from "@/lib/messaging";
import { countUnreadNotifications } from "@/lib/notification";
import { userAvatarSrc } from "@/lib/avatars";
import { CompteScreen } from "./compte-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false },
};

/**
 * Cinquième case de la barre. Les données sont relues ici plutôt que reprises
 * de la coquille : un écran doit tenir debout sans dépendre de ce qu'un autre
 * lui aurait passé, et le layout ne peut de toute façon rien transmettre à une
 * page qu'il enveloppe.
 */
export default async function ComptePage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  const [profile, unreadMessages, unreadNotifications, openApplication] = await Promise.all([
    db.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, fullName: true, preferredName: true, avatarUrl: true, avatarS3Key: true },
    }),
    countUnreadMessages(auth.user.id, auth.user.trainerId),
    countUnreadNotifications(auth.user.id),
    // Même règle que la coquille : le dossier de candidature ouvre une entrée
    // tant qu'il en reste un à suivre, `PENDING_TRAINER` ne couvrant pas le
    // brouillon abandonné en route.
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
    <CompteScreen
      name={
        profile?.preferredName ||
        profile?.fullName ||
        auth.user.email.split("@")[0] ||
        "Mon compte"
      }
      email={auth.user.email}
      avatarUrl={profile ? userAvatarSrc(profile) : null}
      isTrainer={Boolean(auth.user.trainerId)}
      hasOpenApplication={openApplication !== null}
      unreadMessages={unreadMessages}
      unreadNotifications={unreadNotifications}
    />
  );
}
