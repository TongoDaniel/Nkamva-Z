import type { Metadata } from "next";
import { PageHead } from "@/components/nk/page-head";
import { getAuthContext } from "@/lib/api";
import { getProfile } from "@/lib/profile";
import { getTwoFactorStatus } from "@/lib/two-factor";
import { ProfileTabs } from "./profile-tabs";
import { TwoFactorPanel } from "./two-factor-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profil et paramètres",
  robots: { index: false },
};

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) return null;

  const [profile, twoFactor, { onglet }] = await Promise.all([
    getProfile(auth.user.id),
    getTwoFactorStatus(auth.user.id),
    searchParams,
  ]);
  if (!profile) return null;

  return (
    <div className="nk-wrap pb-16">
      <PageHead
        title="Profil et paramètres"
        lead="Vos informations, votre mot de passe et vos droits sur vos données."
      />
      <ProfileTabs profile={profile} initialTab={onglet} />

      {/* Hors des onglets, à dessein : la sécurité du compte ne doit pas se
          trouver derrière un onglet qu'on n'ouvre jamais. */}
      <div className="mt-8">
        <TwoFactorPanel initial={twoFactor} />
      </div>
    </div>
  );
}
