"use client";

import * as React from "react";
import { Tabs } from "@/components/nk/tabs";

const PANEL_ID = "nk-communaute";

type Panel = "publique" | "salons" | "invitations" | "membres";

/**
 * Les trois rubriques de « Ma communauté ».
 *
 * L'écran empilait six blocs sur un seul défilement — bannière, visibilité,
 * invitations, membres, puis un formulaire qui portait à lui seul le nom, la
 * présentation, les règles, le prix et les cinq salons. Ils sont regroupés par
 * question posée : ce qu'un visiteur voit avant de payer, comment le salon
 * fonctionne, et qui est dedans.
 *
 * Les trois panneaux sont rendus puis masqués, jamais démontés : changer
 * d'onglet au milieu d'une saisie ne doit pas la perdre. C'est aussi ce qui
 * permet de passer ici des blocs rendus côté serveur.
 */
export function CommunityTabs({
  publique,
  salons,
  invitations,
  membres,
  membersCount,
  invitationsCount,
}: {
  publique: React.ReactNode;
  salons: React.ReactNode;
  invitations: React.ReactNode;
  membres: React.ReactNode;
  membersCount: number;
  /** Invitations encore en attente — les seules qui appellent une action. */
  invitationsCount: number;
}) {
  const [tab, setTab] = React.useState<Panel>("publique");

  const panels: Array<{ value: Panel; node: React.ReactNode }> = [
    { value: "publique", node: publique },
    { value: "salons", node: salons },
    { value: "invitations", node: invitations },
    { value: "membres", node: membres },
  ];

  return (
    <div className="mt-8">
      <Tabs
        label="Rubriques de ma communauté"
        panelId={PANEL_ID}
        value={tab}
        onValueChange={(value) => setTab(value as Panel)}
        items={[
          { value: "publique", label: "Fiche publique" },
          { value: "salons", label: "Salons" },
          // Les invitations en attente seulement : une invitation acceptée ou
          // expirée n'appelle plus rien, la compter ferait sonner l'onglet pour
          // du passé. Les membres, eux, se comptent tous.
          { value: "invitations", label: "Invitations", count: invitationsCount },
          { value: "membres", label: "Membres", count: membersCount },
        ]}
      />

      <div id={PANEL_ID}>
        {panels.map(({ value, node }) => (
          <div
            key={value}
            role="tabpanel"
            aria-labelledby={`${PANEL_ID}-tab-${value}`}
            hidden={tab !== value}
          >
            {node}
          </div>
        ))}
      </div>
    </div>
  );
}
