import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";
import { CommunityCard } from "@/components/nk/community-card";
import { DemoNotice } from "@/components/nk/demo-notice";
import { EmptyState } from "@/components/nk/empty-state";
import { PageHead } from "@/components/nk/page-head";
import { ResourceCard } from "@/components/nk/resource-card";
import { COMMUNITIES } from "@/features/demo/community-data";
import { DEMO_COURSES } from "@/lib/demo/catalog";

export const metadata: Metadata = {
  title: "Vos favoris",
  description: "Ressources et communautés que vous avez mises de côté, à retrouver ici.",
};

// Aucune route `/api/me/favorites` n'existe : la mise en favori n'est persistée
// nulle part. L'écran montre donc la maquette avec un extrait du catalogue de
// démonstration, et le dit. À rebrancher quand le modèle Favorite arrivera.
const FAVORITE_COURSES = DEMO_COURSES.slice(0, 3);
const FAVORITE_COMMUNITIES = COMMUNITIES.slice(0, 2);

function Count({ n }: { n: number }) {
  return (
    <Chip tone="muted" className="ml-2 align-middle font-display">
      {n}
    </Chip>
  );
}

export default function FavorisPage() {
  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Favoris" }]}
        title="Vos favoris"
        lead="Ressources et communautés que vous avez mises de côté, à retrouver ici."
      />

      <DemoNotice className="mt-4">
        Les favoris ne sont pas encore enregistrés : cet écran présente la mise en page avec un
        extrait du catalogue de démonstration.
      </DemoNotice>

      <section className="mt-9" aria-labelledby="fav-ressources">
        <h2 id="fav-ressources" className="mb-5 text-[clamp(22px,2.4vw,28px)] font-extrabold">
          Ressources
          <Count n={FAVORITE_COURSES.length} />
        </h2>
        {FAVORITE_COURSES.length === 0 ? (
          <EmptyState
            icon={<Heart />}
            title="Aucune ressource en favori"
            description="Touchez le cœur sur une ressource du catalogue pour la retrouver ici."
            action={
              <Btn asChild variant="o">
                <Link href="/ressources">Parcourir le catalogue</Link>
              </Btn>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {FAVORITE_COURSES.map((course) => (
              <ResourceCard key={course.id} course={course} favoritable />
            ))}
          </div>
        )}
      </section>

      <section className="mt-[52px]" aria-labelledby="fav-communautes">
        <h2 id="fav-communautes" className="mb-5 text-[clamp(22px,2.4vw,28px)] font-extrabold">
          Communautés
          <Count n={FAVORITE_COMMUNITIES.length} />
        </h2>
        {FAVORITE_COMMUNITIES.length === 0 ? (
          <EmptyState
            icon={<Heart />}
            title="Aucune communauté en favori"
            description="Mettez de côté les communautés qui vous intéressent pour les comparer plus tard."
            action={
              <Btn asChild variant="o">
                <Link href="/communautes">Explorer les communautés</Link>
              </Btn>
            }
          />
        ) : (
          <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {FAVORITE_COMMUNITIES.map((community) => (
              <CommunityCard key={community.slug} community={community} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
