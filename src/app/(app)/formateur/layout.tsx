import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/api";
import { TrainerSubnav } from "./trainer-subnav";

/**
 * Garde de l'espace formateur. Le middleware ne vérifie que l'authentification :
 * la possession d'un TrainerProfile se contrôle ici, avec la même règle que
 * `requireTrainer()` côté API — un `trainerId` non nul.
 *
 * La barre de sous-navigation (`trainer-subnav.tsx`) relie les sections entre
 * elles. Elle avait été retirée au profit des cartes de `/formateur` et du fil
 * d'Ariane ; revue du 16 novembre 2026, elle revient : huit écrans parcourus
 * tous les jours ne se rejoignent pas par un retour à l'accueil.
 */
export default async function FormateurLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/deconnexion");
  if (!auth.user.trainerId) redirect("/devenir-formateur");

  return (
    <>
      <TrainerSubnav />
      {children}
    </>
  );
}
