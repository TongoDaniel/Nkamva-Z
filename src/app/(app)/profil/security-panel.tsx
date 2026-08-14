"use client";

import { Btn } from "@/components/nk/button";
import { SettingCard, SettingRow } from "@/components/nk/setting-card";
import { PasswordPanel } from "@/components/screens/password-panel";
import type { ProfileView } from "@/lib/profile";

export function SecurityPanel({ profile }: { profile: ProfileView }) {
  return (
    <>
      {/* Le formulaire est partagé avec `/admin/mon-compte` : les
          administrateurs sont écartés de cet écran par le cloisonnement, et
          ils doivent pourtant pouvoir changer leur mot de passe. */}
      <PasswordPanel />

      <SettingCard title="Connexion" subtitle="État de l'accès à votre compte.">
        <SettingRow
          title="Adresse e-mail"
          description={profile.email}
          action={
            <span className="text-[13px] font-semibold text-ink-3">
              Modification à venir
            </span>
          }
        />
        <SettingRow
          title="Vérification de l'adresse"
          description={
            profile.emailVerifiedAt
              ? "Votre adresse est vérifiée."
              : "Votre adresse n'est pas encore vérifiée."
          }
          action={
            profile.emailVerifiedAt ? (
              <span className="text-[13px] font-semibold text-brand-dark">Vérifiée</span>
            ) : (
              <Btn asChild variant="o" size="sm">
                <a href={`/auth/verifier-code?email=${encodeURIComponent(profile.email)}`}>
                  Vérifier maintenant
                </a>
              </Btn>
            )
          }
        />
      </SettingCard>
    </>
  );
}
