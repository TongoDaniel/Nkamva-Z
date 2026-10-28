"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Gift, Link2, Loader2, Mail, Search, Trash2 } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { HeadingCount } from "@/components/nk/heading-count";
import { HintedHeading } from "@/components/nk/hint";
import { Field, PillInput } from "@/components/nk/input";
import { StPill } from "@/components/nk/status-pill";
import { Tabs } from "@/components/nk/tabs";
import { EmptyState } from "@/components/nk/empty-state";
import { toast } from "@/components/nk/toast";
import { useKeyedAction } from "@/hooks/use-action";
import { api } from "@/lib/client";
import { fmtDate } from "@/lib/format";

export interface InvitationRow {
  id: string;
  kind: "NOMINATIVE" | "SHARE_LINK";
  grant: "GIFT" | "PAID";
  status: string;
  email: string | null;
  giftMonths: number | null;
  tokenPrefix: string;
  usesCount: number;
  maxUses: number;
  expiresAt: string;
  issuerRole: "TRAINER" | "MEMBER";
  issuerName: string | null;
  /** Le clair, pour un lien partageable seulement. */
  url: string | null;
}

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "muted"> = {
  PENDING: "ok",
  ACCEPTED: "muted",
  EXPIRED: "warn",
  REVOKED: "bad",
  EXHAUSTED: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  EXPIRED: "Expirée",
  REVOKED: "Révoquée",
  EXHAUSTED: "Épuisée",
};

/**
 * Ce que porte la pastille, et qui n'est pas la même chose selon la forme
 * (arbitrage 123).
 *
 * Un **nominatif** est à usage unique : « En attente » puis « Acceptée » dit
 * tout. Un **lien partageable** est multi-usage — il n'a pas d'état « accepté »,
 * et lui appliquer la pastille binaire le laissait indéfiniment « En attente »
 * alors que des membres étaient entrés. C'est ce que le formateur lisait comme
 * une panne, et c'est le constat 10 de l'audit.
 *
 * Tant qu'il sert, son statut **est** son compteur. Il ne reprend un libellé
 * que devenu terminal — là, il n'y a plus rien à compter.
 */
function statusPill(row: InvitationRow): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (row.kind === "SHARE_LINK" && row.status === "PENDING") {
    return { label: `${row.usesCount} / ${row.maxUses} entrés`, tone: "ok" };
  }
  return {
    label: STATUS_LABEL[row.status] ?? row.status,
    tone: STATUS_TONE[row.status] ?? "muted",
  };
}

/**
 * « Closes » réunit ce qui ne peut plus servir, par trois chemins différents.
 * On les distingue rarement quand on cherche, et la ligne les nomme toujours.
 */
const FILTERS: ReadonlyArray<{
  value: string;
  label: string;
  /** `null` = aucun filtre d'état. */
  statuses: readonly string[] | null;
}> = [
  { value: "all", label: "Toutes", statuses: null },
  // « Actives » plutôt qu'« En attente » : le même état recouvre un nominatif
  // qui attend sa personne et un lien qui, lui, sert déjà. Attendre n'est pas
  // ce que fait un lien à sa troisième entrée.
  { value: "pending", label: "Actives", statuses: ["PENDING"] },
  { value: "accepted", label: "Acceptées", statuses: ["ACCEPTED"] },
  { value: "closed", label: "Closes", statuses: ["EXPIRED", "REVOKED", "EXHAUSTED"] },
];

async function copy(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  } catch {
    // Le presse-papier est refusé hors contexte sécurisé : on ne prétend pas
    // avoir copié quand ce n'est pas le cas.
    toast.error("Copie refusée par le navigateur. Sélectionnez le lien à la main.");
  }
}

export function InvitationsPanel({
  communityId,
  isPrivate,
  initial,
}: {
  communityId: string;
  isPrivate: boolean;
  initial: InvitationRow[];
}) {
  const [email, setEmail] = React.useState("");
  const [grant, setGrant] = React.useState<"PAID" | "GIFT">("PAID");
  const [giftMonths, setGiftMonths] = React.useState("1");
  // Clés portant l'identifiant de l'invitation pour la révocation : l'état
  // occupé se pose sur la seule ligne cliquée.
  const action = useKeyedAction();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const queryClient = useQueryClient();

  // Onglet masqué, rien ne part — règle 11 du §10.2, comme au lot 4. TanStack
  // suspend déjà ses intervalles sur un document masqué ; on double la garde
  // parce qu'elle est explicite, et qu'elle survivra à un réglage global.
  const [ongletVisible, setOngletVisible] = React.useState(true);
  React.useEffect(() => {
    const suivre = () => setOngletVisible(!document.hidden);
    suivre();
    document.addEventListener("visibilitychange", suivre);
    return () => document.removeEventListener("visibilitychange", suivre);
  }, []);

  const listKey = React.useMemo(() => ["trainer-invitations", communityId] as const, [communityId]);
  // La date de la première valeur, figée : sans elle, react-query tiendrait les
  // lignes rendues par le serveur pour périmées et redemanderait tout au montage.
  const [seededAt] = React.useState(() => Date.now());

  /**
   * Une invitation change d'état **sans que le formateur touche à rien** : un
   * invité accepte, un lien atteint son quota, une échéance passe. Sans sondage,
   * l'écran restait figé sur ce qu'il montrait à l'ouverture — c'est l'autre
   * moitié du constat 10, celle que la pastille seule ne corrige pas.
   */
  const { data: rows = initial } = useQuery({
    queryKey: listKey,
    queryFn: fetchRows,
    initialData: initial,
    initialDataUpdatedAt: seededAt,
    // §4.2 — 15 s sur une liste.
    refetchInterval: ongletVisible ? 15_000 : false,
    staleTime: 15_000,
  });

  const setRows = React.useCallback(
    (fresh: InvitationRow[]) => queryClient.setQueryData(listKey, fresh),
    [queryClient, listKey],
  );

  const countFor = (statuses: readonly string[] | null) =>
    statuses ? rows.filter((r) => statuses.includes(r.status)).length : rows.length;

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    const statuses = FILTERS.find((f) => f.value === filter)?.statuses ?? null;
    return rows.filter((row) => {
      if (statuses && !statuses.includes(row.status)) return false;
      if (!needle) return true;
      // Un lien de parrainage n'a pas d'adresse : il se cherche par son préfixe,
      // le seul morceau du jeton qu'on ait le droit de montrer.
      return (row.email ?? row.tokenPrefix).toLowerCase().includes(needle);
    });
  }, [rows, search, filter]);

  /**
   * Relit la liste. Appelée *dans* l'action, elle est couverte par l'état
   * occupé : le bouton cesse de tourner quand les lignes fraîches sont là.
   */
  async function fetchRows() {
    const { data } = await api.get<InvitationRow[]>(
      `/api/trainer/communities/${communityId}/invitations`,
    );
    return data;
  }

  function issueNominative(e: React.FormEvent) {
    e.preventDefault();
    void action.run(
      "nominative",
      async () => {
        const { data } = await api.post<{ url: string; emailed: boolean }>(
          `/api/trainer/communities/${communityId}/invitations`,
          {
            kind: "NOMINATIVE",
            grant,
            email: email.trim().toLowerCase(),
            ...(grant === "GIFT" ? { giftMonths: Number.parseInt(giftMonths, 10) } : {}),
          },
        );
        // Le jeton nominatif reste haché : c'est la seule fois où il s'affiche.
        await copy(
          data.url,
          data.emailed
            ? "Invitation envoyée, et son lien copié. Il ne sera plus affiché."
            : "Invitation créée, lien copié. L'e-mail n'est pas parti : transmettez-le vous-même.",
        );
        return fetchRows();
      },
      {
        // `copy` a déjà dit ce qui s'est passé, et le détail de son message
        // dépend de l'envoi de l'e-mail : un second toast ferait doublon.
        success: null,
        error: "L'invitation n'a pas pu être émise.",
        onSuccess: (fresh) => {
          setRows(fresh);
          setEmail("");
        },
      },
    );
  }

  function issueShareLink() {
    void action.run(
      "share",
      async () => {
        const { data } = await api.post<{ url: string }>(
          `/api/trainer/communities/${communityId}/invitations`,
          { kind: "SHARE_LINK" },
        );
        await copy(data.url, "Lien de parrainage copié.");
        return fetchRows();
      },
      {
        success: null,
        error: "Le lien n'a pas pu être créé.",
        onSuccess: (fresh) => setRows(fresh),
      },
    );
  }

  function revoke(id: string) {
    void action.run(
      `revoke:${id}`,
      async () => {
        await api.del(`/api/trainer/communities/${communityId}/invitations/${id}`);
        return fetchRows();
      },
      {
        success: "Invitation retirée.",
        error: "La révocation a échoué.",
        onSuccess: (fresh) => setRows(fresh),
      },
    );
  }

  return (
    <section className="mt-6 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
      {/* Les deux boutons du formulaire nomment déjà les deux voies ; ce qui
          les distingue se lit une fois, derrière le ⓘ. */}
      <HintedHeading
        hintLabel="Nominative ou parrainage : la différence"
        hint={
          <>
            Une invitation nominative s&apos;adresse à une personne et ne sert qu&apos;une fois. Un
            lien de parrainage se recopie et vaut pour plusieurs entrées, au tarif plein.
          </>
        }
      >
        Inviter
      </HintedHeading>

      <form onSubmit={issueNominative} noValidate className="mt-5 border-t border-line-2 pt-5">
        <div className="grid gap-x-4 sm:grid-cols-[1fr_auto]">
          <Field
            label="Adresse à inviter"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@exemple.com"
            required
          />
          <div className="mb-[18px]">
            <span className="mb-1.5 block text-[13.5px] font-bold text-ink">Nature</span>
            <div className="flex gap-2">
              {(
                [
                  ["PAID", "Tarif plein"],
                  ["GIFT", "Mois offerts"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGrant(value)}
                  aria-pressed={grant === value}
                  className={
                    grant === value
                      ? "cursor-pointer rounded-xl border-[1.5px] border-brand bg-brand-tint px-3.5 py-[13px] text-[14px] font-bold text-brand"
                      : "cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3.5 py-[13px] text-[14px] font-semibold text-ink-2 hover:border-ink-3"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {grant === "GIFT" ? (
          <Field
            label="Mois offerts"
            type="number"
            min={1}
            max={3}
            value={giftMonths}
            onChange={(e) => setGiftMonths(e.target.value)}
            hint="1 à 3 mois. L'invité n'a rien à régler, et rien ne lui sera prélevé au terme : l'adhésion offerte s'arrête, elle ne se reconduit pas."
            containerClassName="max-w-[220px]"
          />
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Btn type="submit" loading={action.isRunning("nominative")} disabled={!email.trim()}>
            <Mail className="size-4" aria-hidden="true" />
            Envoyer l&apos;invitation
          </Btn>
          <Btn type="button" variant="o" onClick={issueShareLink} loading={action.isRunning("share")} disabled={isPrivate}>
            <Link2 className="size-4" aria-hidden="true" />
            Lien de parrainage
          </Btn>
        </div>
        {isPrivate ? (
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-3">
            Votre salon est fermé : on n&apos;y entre que sur invitation nominative, le lien de
            parrainage y est interdit.
          </p>
        ) : null}
      </form>

      <div className="mt-7 border-t border-line-2 pt-5">
        <h3 className="mb-3.5 text-[15px] font-bold">
          Invitations émises
          <HeadingCount n={rows.length} />
        </h3>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Gift />}
            title="Aucune invitation"
            description="Les invitations que vous émettez apparaîtront ici, avec leur état."
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3.5">
              <div className="min-w-[220px] max-w-[420px] flex-1">
                <label htmlFor="invitations-recherche" className="sr-only">
                  Rechercher une invitation par adresse
                </label>
                <PillInput
                  id="invitations-recherche"
                  type="search"
                  icon={<Search />}
                  placeholder="Rechercher une adresse…"
                  autoComplete="off"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <p className="whitespace-nowrap text-sm font-semibold text-ink-2" aria-live="polite">
                <b className="font-extrabold text-ink">{visible.length}</b> invitation
                {visible.length > 1 ? "s" : ""}
              </p>
            </div>

            <Tabs
              label="Filtrer les invitations par état"
              variant="chip"
              className="mb-4"
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
                icon={<Search />}
                title="Aucune invitation ne correspond"
                description="Essayez une autre adresse, ou revenez au filtre « Toutes »."
              />
            ) : (
          <ul className="grid gap-2.5">
            {visible.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-nk border border-line px-4 py-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
                  {row.kind === "SHARE_LINK" ? (
                    <Link2 className="size-4" aria-hidden="true" />
                  ) : (
                    <Mail className="size-4" aria-hidden="true" />
                  )}
                </span>

                <div className="min-w-[180px] flex-1">
                  <p className="text-[14px] font-semibold text-ink">
                    {row.kind === "SHARE_LINK"
                      ? "Lien de parrainage"
                      : (row.email ?? "adresse effacée")}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-3">
                    {row.grant === "GIFT" ? `${row.giftMonths} mois offerts · ` : "Tarif plein · "}
                    {row.issuerRole === "MEMBER"
                      ? `partagé par ${row.issuerName ?? "un membre"} · `
                      : ""}
                    expire le {fmtDate(row.expiresAt)}
                  </p>
                </div>

                {(() => {
                  const pill = statusPill(row);
                  return <StPill tone={pill.tone}>{pill.label}</StPill>;
                })()}

                {row.url ? (
                  <button
                    type="button"
                    onClick={() => copy(row.url!, "Lien copié.")}
                    aria-label="Copier le lien de parrainage"
                    className="nk-tap grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-brand hover:text-brand"
                  >
                    <Copy className="size-4" aria-hidden="true" />
                  </button>
                ) : null}

                {row.status === "PENDING" ? (
                  <button
                    type="button"
                    onClick={() => revoke(row.id)}
                    disabled={action.isRunning(`revoke:${row.id}`)}
                    aria-busy={action.isRunning(`revoke:${row.id}`) || undefined}
                    aria-label={`Retirer l'invitation ${row.email ?? row.tokenPrefix}`}
                    className="nk-tap grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-danger hover:text-danger disabled:opacity-50"
                  >
                    {action.isRunning(`revoke:${row.id}`) ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="size-4" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
