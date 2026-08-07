import { NotFoundBody } from "@/components/layouts/not-found-body";

/** `PublicShell` est déjà posée par le layout du groupe : pas de coquille ici. */
export default function PublicNotFound() {
  return <NotFoundBody space="public" />;
}
