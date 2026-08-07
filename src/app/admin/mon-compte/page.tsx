import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { AdminHead } from "@/components/layouts/admin-shell";
import { SettingCard, SettingRow } from "@/components/nk/setting-card";
import { StPill } from "@/components/nk/status-pill";
import { PasswordPanel } from "@/components/screens/password-panel";
import { TwoFactorPanel } from "@/components/screens/two-factor-panel";
import { getAuthContext } from "@/lib/api";
import { ADMIN_ROLE_LABELS } from "@/lib/admins";
import { getProfile } from "@/lib/profile";
import { getTwoFactorStatus, adminTwoFactorEnforced } from "@/lib/two-factor";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false },
};

/**
 * Compte personnel d'un administrateur — mot de passe et double
 * authentification.
 *
 * Cet écran comble une contradiction : `twoFactorRequiredFor` déclare la
 * protection **obligatoire** pour tout compte ADMIN, et `/profil`, qui la
 * portait, est interdit aux administrateurs par le cloisonnement
 * (`NON_ADMIN_PREFIXES`). Aucun d'eux ne pouvait donc s'enrôler, ni changer son
 * mot de passe. Pire : `REQUIRE_ADMIN_2FA=1` les aurait tous verrouillés
 * dehors, sans personne pour rouvrir.
 *
 * Aucune garde de sous-rôle ici, volontairement : Finances et Modération ont
 * autant besoin de leur second facteur que le Super-admin. Réserver l'écran
 * au Super-admin ne boucherait le trou qu'au tiers.
 *
 * Ce qui n'y figure pas non plus est un choix : ni export RGPD, ni suppression
 * de compte, ni préférences d'achat. Un compte d'administration se ferme depuis
 * `/admin/administrateurs`, par quelqu'un d'autre — c'est la même règle que
 * celle qui interdit à un admin de s'auto-révoquer.
 */
export default async function AdminMonComptePage() {
  const auth = await getAuthContext();
  if (!auth) return null;

  const [profile, twoFactor] = await Promise.all([
    getProfile(auth.user.id),
    getTwoFactorStatus(auth.user.id),
  ]);
  if (!profile) return null;

  const enforced = adminTwoFactorEnforced();

  return (
    <>
      <AdminHead
        title="Mon compte"
        lead="Votre accès à l'administration : mot de passe et double authentification. Les réglages de la plateforme sont ailleurs, dans Paramètres."
      />

      {twoFactor.required && !twoFactor.enabled ? (
        <p className="mb-6 flex items-start gap-2.5 rounded-nk-lg border border-danger/30 bg-danger/5 px-4 py-3.5 text-[13.5px] leading-relaxed text-ink">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <span>
            <b className="font-bold">Votre compte n&apos;a pas de second facteur.</b>{" "}
            {enforced
              ? "La contrainte est active sur cette installation : sans enrôlement, votre prochaine connexion sera refusée."
              : "Votre rôle vous permet de lever une exclusion, de poser un tarif et d'approuver un retrait. Le mot de passe seul ne protège pas ces gestes."}
          </span>
        </p>
      ) : null}

      <div className="mx-0 max-w-[760px]">
        <SettingCard title="Identité" subtitle="Ce que le journal d'audit inscrit à côté de chacune de vos actions.">
          <SettingRow
            title="Nom"
            description={profile.fullName ?? "Non renseigné"}
            action={
              <span className="text-[12.5px] font-semibold text-ink-3">
                Modification par un Super-admin
              </span>
            }
          />
          <SettingRow
            title="Adresse e-mail"
            description={profile.email}
            action={
              profile.emailVerifiedAt ? (
                <StPill tone="ok">Vérifiée</StPill>
              ) : (
                <StPill tone="warn">Non vérifiée</StPill>
              )
            }
          />
          <SettingRow
            title="Rôle"
            description={
              auth.user.adminRole
                ? `${ADMIN_ROLE_LABELS[auth.user.adminRole]} — ouvert le ${fmtDate(profile.createdAt)}`
                : "Aucun sous-rôle"
            }
            action={
              <span className="text-[12.5px] font-semibold text-ink-3">
                Attribué à l&apos;ouverture
              </span>
            }
          />
        </SettingCard>

        {/* Après déconnexion, retour dans l'espace d'administration : renvoyer
            un admin vers l'accueil apprenant le ferait rebondir sur le
            cloisonnement. */}
        <PasswordPanel callbackUrl="/auth/connexion?password=1&callbackUrl=%2Fadmin" />

        <TwoFactorPanel initial={twoFactor} />
      </div>
    </>
  );
}
