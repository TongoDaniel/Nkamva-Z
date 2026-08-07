import { PublicShell } from "@/components/layouts/public-shell";
import { NotFoundBody } from "@/components/layouts/not-found-body";

/**
 * 404 des URLs qui ne correspondent à aucun segment : elles sont rendues hors
 * de tout groupe de routes, donc sans coquille. C'est le seul `not-found` qui
 * doit poser la sienne — voir `NotFoundBody`.
 */
export default function NotFound() {
  return (
    <PublicShell>
      <NotFoundBody />
    </PublicShell>
  );
}
