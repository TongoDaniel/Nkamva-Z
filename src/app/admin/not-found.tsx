import Link from "next/link";
import { Compass } from "lucide-react";
import { AdminHead } from "@/components/layouts/admin-shell";
import { EmptyState } from "@/components/nk/empty-state";
import { Btn } from "@/components/nk/button";

/**
 * `AdminShell` est déjà posée par `admin/layout.tsx` : pas de coquille ici, et
 * surtout pas celle du visiteur. Les liens de secours restent dans
 * l'administration.
 */
export default function AdminNotFound() {
  return (
    <>
      <AdminHead title="Introuvable" />
      <EmptyState
        icon={<Compass />}
        title="Ce dossier n'existe pas"
        description="Il a peut-être été traité et archivé, ou le lien est obsolète."
        action={
          <Btn asChild>
            <Link href="/admin">Retour au tableau de bord</Link>
          </Btn>
        }
      />
    </>
  );
}
