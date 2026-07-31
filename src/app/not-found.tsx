import Link from "next/link";
import { Compass } from "lucide-react";
import { PublicShell } from "@/components/layouts/public-shell";
import { EmptyState } from "@/components/nk/empty-state";
import { Btn } from "@/components/nk/button";

export default function NotFound() {
  return (
    <PublicShell>
      <div className="nk-wrap py-20">
        <EmptyState
          icon={<Compass />}
          title="Cette page n'existe pas"
          description="Le lien est peut-être obsolète, ou la ressource a été retirée du catalogue."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Btn asChild>
                <Link href="/ressources">Parcourir le catalogue</Link>
              </Btn>
              <Btn asChild variant="o">
                <Link href="/">Retour à l&apos;accueil</Link>
              </Btn>
            </div>
          }
        />
      </div>
    </PublicShell>
  );
}
