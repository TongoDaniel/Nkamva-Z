import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/api";

/**
 * Garde de l'espace formateur. Le middleware ne vérifie que l'authentification :
 * la possession d'un TrainerProfile se contrôle ici, avec la même règle que
 * `requireTrainer()` côté API — un `trainerId` non nul.
 */
export default async function FormateurLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/connexion");
  if (!auth.user.trainerId) redirect("/devenir-formateur");

  return <>{children}</>;
}
