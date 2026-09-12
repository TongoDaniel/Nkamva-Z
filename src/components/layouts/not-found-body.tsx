import { Compass } from "lucide-react";
import { EmptyState } from "@/components/nk/empty-state";
import { BtnLink } from "@/components/nk/button-link";
import { routesOf, type Space } from "@/lib/spaces";

/**
 * Corps de la page « introuvable », sans coquille.
 *
 * La coquille est fournie par le layout du groupe de routes où la 404 est
 * levée : un `not-found.tsx` qui rendrait lui-même `PublicShell` empilerait une
 * seconde topbar et un second pied de page à l'intérieur de la coquille déjà
 * posée par le layout. Seul `app/not-found.tsx`, qui vit hors de tout groupe,
 * doit envelopper ce corps.
 */
export function NotFoundBody({ space = "public" }: { space?: Space }) {
  const routes = routesOf(space);

  return (
    <div className="nk-wrap py-12 sm:py-20">
      <EmptyState
        icon={<Compass />}
        title="Cette page n'existe pas"
        description="Le lien est peut-être obsolète, ou la ressource a été retirée du catalogue."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <BtnLink href={routes.catalog}>Parcourir le catalogue</BtnLink>
            <BtnLink href={routes.home} variant="o">Retour à l&apos;accueil</BtnLink>
          </div>
        }
      />
    </div>
  );
}
