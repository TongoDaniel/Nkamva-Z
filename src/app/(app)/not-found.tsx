import { NotFoundBody } from "@/components/layouts/not-found-body";

/**
 * `AppShell` est déjà posée par le layout du groupe. Les liens de secours
 * pointent vers l'espace connecté : renvoyer vers `/ressources` ferait
 * retomber l'utilisateur dans la coquille visiteur.
 */
export default function AppNotFound() {
  return <NotFoundBody space="app" />;
}
