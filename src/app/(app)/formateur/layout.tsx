import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/api";

/**
 * Garde de l'espace formateur. Le middleware ne vérifie que l'authentification :
 * la possession d'un TrainerProfile se contrôle ici, avec la même règle que
 * `requireTrainer()` côté API — un `trainerId` non nul.
 *
 * Pas de barre de sous-navigation ici : les cinq sections se rejoignent par les
 * cartes de `/formateur`, par le fil d'Ariane qui y ramène, et par le menu
 * burger sur mobile. Une seconde barre sous celle du haut coûtait un bandeau
 * permanent sur chaque écran pour un déplacement qui reste rare.
 */
export default async function FormateurLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/deconnexion");
  if (!auth.user.trainerId) redirect("/devenir-formateur");

  return <>{children}</>;
}
