"use client";

import * as React from "react";
import { Tabs } from "@/components/nk/tabs";
import type { ProfileView } from "@/lib/profile";
import { ProfileInfoPanel } from "./profile-info-panel";
import { AvatarPanel } from "@/components/screens/avatar-panel";
import { EmailPrefsPanel } from "./email-prefs-panel";
import { SecurityPanel } from "./security-panel";
import { DataPanel } from "./data-panel";

const TABS = [
  { value: "profil", label: "Profil" },
  { value: "securite", label: "Sécurité" },
  { value: "donnees", label: "Mes données" },
];

export function ProfileTabs({
  profile,
  initialTab,
}: {
  profile: ProfileView;
  initialTab?: string;
}) {
  const [tab, setTab] = React.useState(
    TABS.some((t) => t.value === initialTab) ? (initialTab as string) : "profil",
  );

  return (
    <>
      {/* Une suppression programmée doit se voir quel que soit l'onglet ouvert. */}
      {profile.deletionRequestedAt ? (
        <p
          role="status"
          className="mb-6 mt-2 rounded-nk border border-line bg-card border-l-4 border-l-danger px-5 py-4 text-[14px] font-semibold leading-relaxed text-danger rounded-l-sm"
        >
          La suppression de ce compte est programmée. Vous pouvez encore l&apos;annuler depuis
          l&apos;onglet « Mes données ».
        </p>
      ) : null}

      <Tabs
        label="Sections du profil"
        panelId="profil-panneau"
        items={TABS}
        value={tab}
        onValueChange={setTab}
        className="mt-6"
      />

      <div id="profil-panneau" className="max-w-[760px]">
        {tab === "profil" ? (
          <>
            {/* Avant les champs : c'est la première chose qu'on vient y faire,
                et la seule que les autres écrans montrent de vous. */}
            <AvatarPanel
              endpoint="/api/me/avatar"
              kind="person"
              name={profile.preferredName || profile.fullName || profile.email}
              src={profile.avatarUrl}
              title="Votre photo"
              about="Elle vous accompagne dans la messagerie, dans les communautés que vous rejoignez, et en tête de votre espace."
            />
            <ProfileInfoPanel profile={profile} />
            <EmailPrefsPanel profile={profile} />
          </>
        ) : null}
        {tab === "securite" ? <SecurityPanel profile={profile} /> : null}
        {tab === "donnees" ? <DataPanel profile={profile} /> : null}
      </div>
    </>
  );
}
