import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/api";
import { TrainerNav } from "./trainer-nav";

/**
 * Garde de l'espace formateur. Le middleware ne vérifie que l'authentification :
 * la possession d'un TrainerProfile se contrôle ici, avec la même règle que
 * `requireTrainer()` côté API — un `trainerId` non nul.
 *
 * C'est aussi ce layout qui porte la sous-navigation : les cinq sections ne
 * figurent plus dans la barre principale, elles se rejoignent depuis ici.
 */
export default async function FormateurLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/connexion");
  if (!auth.user.trainerId) redirect("/devenir-formateur");

  return (
    <>
      <TrainerNav />
      {children}
    </>
  );
}
