import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Les sessions du formateur ont rejoint l'agenda unique de `/mes-lives`.
 *
 * La route survit en redirection plutôt que d'être supprimée : elle a été
 * envoyée en notification (« un replay sera purgé »), elle est le fil d'Ariane
 * de la console d'animation, et rien ne garantit qu'aucun signet ne la porte.
 * Une redirection coûte un fichier ; un 404 coûte un accès perdu.
 *
 * La console `/formateur/lives/[sessionId]/console` reste ici, elle : c'est un
 * écran d'animation, réservé à l'hôte, et il n'a pas d'équivalent apprenant.
 */
export default function FormateurLivesPage() {
  redirect("/mes-lives");
}
