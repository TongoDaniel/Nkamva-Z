"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gift, MessageSquare, Search, ShieldBan, ShieldCheck, Users } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { HeadingCount } from "@/components/nk/heading-count";
import { HintedHeading } from "@/components/nk/hint";
import { PillInput } from "@/components/nk/input";
import { StPill } from "@/components/nk/status-pill";
import { Tabs } from "@/components/nk/tabs";
import { Avatar } from "@/components/nk/avatar";
import { EmptyState } from "@/components/nk/empty-state";
import { Modal } from "@/components/nk/modal";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtDate } from "@/lib/format";

export interface MemberRow {
  learnerId: string;
  fullName: string | null;
  status: string;
  periodEnd: string;
  bannedReason: string | null;
  canceledAt: string | null;
  viaInvitation: boolean;
}

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  ACTIVE: { label: "À jour", tone: "ok" },
  PAST_DUE: { label: "Impayé", tone: "warn" },
  BANNED: { label: "Banni", tone: "bad" },
  CANCELED: { label: "Résiliée", tone: "muted" },
  EXPIRED: { label: "Terminée", tone: "muted" },
};

/**
 * Les filtres, et les statuts que chacun retient. « Terminées » en réunit deux :
 * une adhésion résiliée et une adhésion expirée ne se distinguent pas quand on
 * cherche qui n'est plus là — la ligne, elle, continue de les nommer.
 */
const FILTERS: ReadonlyArray<{
  value: string;
  label: string;
  /** `null` = aucun filtre d'état. */
  statuses: readonly string[] | null;
}> = [
  { value: "all", label: "Tous", statuses: null },
  { value: "active", label: "À jour", statuses: ["ACTIVE"] },
  { value: "pastDue", label: "Impayés", statuses: ["PAST_DUE"] },
  { value: "banned", label: "Bannis", statuses: ["BANNED"] },
  { value: "ended", label: "Terminées", statuses: ["CANCELED", "EXPIRED"] },
];

/** Les adhésions ouvertes — les seules où un fil privé peut exister. */
const OPEN_STATUSES = ["ACTIVE", "PAST_DUE", "BANNED"];

/** Sans accents ni casse : « Keïta » doit se trouver en tapant « keita ». */
function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function MembersPanel({
  communityId,
  initial,
  messagingEnabled,
}: {
  communityId: string;
  initial: MemberRow[];
  /** Les messages directs sont-ils ouverts ? Sinon, aucun fil ne peut naître. */
  messagingEnabled: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initial);
  const [target, setTarget] = React.useState<MemberRow | null>(null);
  const [reason, setReason] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  // Clés portant l'identifiant du membre : l'état occupé se pose sur la seule
  // ligne cliquée, et non sur toute la liste.
  const action = useKeyedAction();

  React.useEffect(() => setRows(initial), [initial]);

  const countFor = (statuses: readonly string[] | null) =>
    statuses ? rows.filter((r) => statuses.includes(r.status)).length : rows.length;

  const visible = React.useMemo(() => {
    const needle = fold(search.trim());
    const statuses = FILTERS.find((f) => f.value === filter)?.statuses ?? null;
    return rows.filter((row) => {
      if (statuses && !statuses.includes(row.status)) return false;
      if (!needle) return true;
      return fold(row.fullName ?? "Membre").includes(needle);
    });
  }, [rows, search, filter]);

  /**
   * Ouvre le fil du membre puis y emmène. La conversation vit dans la
   * messagerie, pas ici : la dupliquer dans une fenêtre priverait le formateur
   * de l'historique au moment précis où il en a besoin.
   */
  /**
   * Relit la liste. Appelée *dans* l'action, elle est couverte par l'état
   * occupé : la ligne cesse de tourner quand les données fraîches sont là.
   */
  async function fetchRows() {
    const { data } = await api.get<MemberRow[]>(
      `/api/trainer/communities/${communityId}/members`,
    );
    return data;
  }

  /**
   * Ouvre le fil du membre puis y emmène. La conversation vit dans la
   * messagerie, pas ici : la dupliquer dans une fenêtre priverait le formateur
   * de l'historique au moment précis où il en a besoin.
   */
  function write(row: MemberRow) {
    void action.run(
      `write:${row.learnerId}`,
      async () => {
        const { data } = await api.post<{ id: string }>(
          `/api/trainer/communities/${communityId}/conversations`,
          { learnerId: row.learnerId },
        );
        return data.id;
      },
      {
        success: null,
        error: "Le fil n'a pas pu être ouvert.",
        // On quitte l'écran : rien à rafraîchir ici, et la navigation lancée
        // dans la transition tient le bouton occupé jusqu'à l'arrivée du fil.
        refresh: false,
        onSuccess: (id) => router.push(`/messagerie?fil=${id}`),
      },
    );
  }

  function ban() {
    if (!target) return;
    const member = target;
    void action.run(
      "ban",
      async () => {
        await api.post(`/api/trainer/communities/${communityId}/members`, {
          learnerId: member.learnerId,
          action: "BAN",
          reason: reason.trim(),
        });
        return fetchRows();
      },
      {
        success: `${member.fullName ?? "Ce membre"} ne peut plus écrire dans le salon.`,
        error: "L'action a échoué.",
        onSuccess: (fresh) => {
          setRows(fresh);
          setTarget(null);
          setReason("");
        },
      },
    );
  }

  function unban(row: MemberRow) {
    void action.run(
      `unban:${row.learnerId}`,
      async () => {
        await api.post(`/api/trainer/communities/${communityId}/members`, {
          learnerId: row.learnerId,
          action: "UNBAN",
        });
        return fetchRows();
      },
      {
        success: `${row.fullName ?? "Ce membre"} peut de nouveau écrire.`,
        error: "L'action a échoué.",
        onSuccess: (fresh) => setRows(fresh),
      },
    );
  }

  return (
    <section className="mt-6 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
      {/* La règle du bannissement passe derrière le ⓘ : elle se lit une fois,
          et elle est de toute façon rappelée dans la modale de bannissement,
          au seul moment où elle change quelque chose. En tête de panneau, elle
          coûtait cinq lignes avant le premier membre. */}
      <HintedHeading
        hintLabel="Ce que fait un bannissement"
        hint={
          <>
            Bannir retire la parole, pas l&apos;accès : le membre continue de lire le salon et ses
            ressources incluses jusqu&apos;au terme de la période qu&apos;il a réglée. Lui couper
            ce qu&apos;il a payé serait une sanction financière, et c&apos;est au remboursement de
            traiter ces cas.
          </>
        }
      >
        Membres
        <HeadingCount n={rows.length} />
      </HintedHeading>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Users />}
          title="Aucun membre pour l'instant"
          description="Les adhésions apparaîtront ici, avec leur état et leur échéance."
        />
      ) : (
        <>
          {/* `min-w-0` et non `min-w-[220px]` : le compteur passait à la ligne
              sur un téléphone, et cette ligne coûtait autant que le champ
              lui-même. Les deux tiennent désormais sur la même rangée à 375 px. */}
          <div className="mt-5 flex items-center gap-3">
            <div className="min-w-0 max-w-[420px] flex-1">
              <label htmlFor="membres-recherche" className="sr-only">
                Rechercher un membre par son nom
              </label>
              <PillInput
                id="membres-recherche"
                type="search"
                icon={<Search />}
                placeholder="Rechercher un membre…"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="whitespace-nowrap text-sm font-semibold text-ink-2" aria-live="polite">
              <b className="font-extrabold text-ink">{visible.length}</b> membre
              {visible.length > 1 ? "s" : ""}
            </p>
          </div>

          <Tabs
            label="Filtrer les membres par état d'adhésion"
            variant="chip"
            size="sm"
            className="mt-3.5"
            value={filter}
            onValueChange={setFilter}
            items={FILTERS.map((f) => ({
              value: f.value,
              label: f.label,
              count: countFor(f.statuses),
            }))}
          />

          {visible.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={<Search />}
              title="Aucun membre ne correspond"
              description="Essayez un autre nom, ou revenez au filtre « Tous »."
            />
          ) : (
        <ul className="mt-6 grid gap-2.5">
          {visible.map((row) => {
            const state = STATUS[row.status] ?? { label: row.status, tone: "muted" as const };
            const isBanned = row.status === "BANNED";
            return (
              /*
                L'état remonte sur la ligne du nom, et les deux actions
                partagent une rangée. Auparavant, la pastille et chaque bouton
                se posaient tour à tour sur leur propre ligne — quatre rangées
                pour quatre informations, et cinq membres qui ne tenaient pas
                sur un écran de téléphone.
              */
              <li
                key={row.learnerId}
                // `min-w-0` : la liste est une grille, et un élément de grille
                // refuse par défaut de descendre sous la largeur minimale de
                // son contenu. Un nom très long élargissait la ligne au-delà de
                // l'écran — 19 px de débordement horizontal pour toute la page,
                // alors même que le nom, lui, était bien coupé.
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-nk border border-line px-3.5 py-3 sm:px-4"
              >
                <Avatar name={row.fullName ?? "Membre"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] font-semibold text-ink">
                    {/* `min-w-0` avec `truncate` : sans lui, un élément de
                        conteneur flex refuse de rétrécir sous la largeur de son
                        contenu, et un nom très long déborderait au lieu d'être
                        coupé. */}
                    <span className="min-w-0 truncate">{row.fullName ?? "Membre"}</span>
                    {row.viaInvitation ? (
                      <span title="Entré par une invitation">
                        <Gift className="size-3.5 text-ink-3" aria-label="Entré par invitation" />
                      </span>
                    ) : null}
                    <StPill tone={state.tone}>{state.label}</StPill>
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-3">
                    {row.canceledAt ? "Résiliée · accès jusqu'au " : "Échéance le "}
                    {fmtDate(row.periodEnd)}
                  </p>
                  {isBanned && row.bannedReason ? (
                    <p className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-danger">
                      {row.bannedReason}
                    </p>
                  ) : null}
                </div>

                {/* Pleine largeur sous `sm` — donc une rangée à part, alignée à
                    droite — puis en bout de ligne dès que la place existe. */}
                <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                  {/* Le fil suppose une adhésion ouverte et des messages directs
                      actifs : proposer d'écrire à une adhésion terminée mènerait
                      à un refus du serveur, que rien n'annonçait au clic. Un
                      membre banni garde son bouton — c'est souvent là qu'il faut
                      lui expliquer la sanction. */}
                  {messagingEnabled && OPEN_STATUSES.includes(row.status) ? (
                    <Btn
                      variant="t"
                      size="sm"
                      onClick={() => write(row)}
                      loading={action.isRunning(`write:${row.learnerId}`)}
                    >
                      <MessageSquare className="size-4" aria-hidden="true" />
                      Écrire
                    </Btn>
                  ) : null}

                  {isBanned ? (
                    <Btn
                      variant="o"
                      size="sm"
                      onClick={() => unban(row)}
                      loading={action.isRunning(`unban:${row.learnerId}`)}
                    >
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      Rendre la parole
                    </Btn>
                  ) : row.status === "ACTIVE" || row.status === "PAST_DUE" ? (
                    <Btn
                      variant="t"
                      size="sm"
                      onClick={() => {
                        setTarget(row);
                        setReason("");
                      }}
                    >
                      <ShieldBan className="size-4" aria-hidden="true" />
                      Bannir
                    </Btn>
                  ) : null}
                </div>
              </li>
            );
          })}
            </ul>
          )}
        </>
      )}

      <Modal
        open={target != null}
        onOpenChange={(next) => {
          if (!next) setTarget(null);
        }}
        title={`Bannir ${target?.fullName ?? "ce membre"}`}
      >
        <p className="text-[14px] leading-relaxed text-ink-2">
          Le motif lui est communiqué tel quel. Il garde l&apos;accès en lecture et à ses
          ressources incluses jusqu&apos;au terme de sa période.
        </p>
        <label htmlFor="ban-reason" className="mb-1.5 mt-4 block text-[13.5px] font-bold text-ink">
          Motif
        </label>
        <textarea
          id="ban-reason"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ce qui a été constaté, et ce qui avait déjà été demandé."
          className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
        />
        <p className="mt-1.5 text-[13px] text-ink-3">Dix caractères au minimum.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Btn variant="o" disabled={action.busy} onClick={() => setTarget(null)}>
            Annuler
          </Btn>
          <Btn
            onClick={ban}
            loading={action.isRunning("ban")}
            disabled={reason.trim().length < 10}
          >
            Bannir du salon
          </Btn>
        </div>
      </Modal>
    </section>
  );
}
