"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Gift, Link2, Mail, Trash2 } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";
import { Field } from "@/components/nk/input";
import { StPill } from "@/components/nk/status-pill";
import { EmptyState } from "@/components/nk/empty-state";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
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
  const router = useRouter();
  const [rows, setRows] = React.useState(initial);
  const [email, setEmail] = React.useState("");
  const [grant, setGrant] = React.useState<"PAID" | "GIFT">("PAID");
  const [giftMonths, setGiftMonths] = React.useState("1");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => setRows(initial), [initial]);

  async function reload() {
    const { data } = await api.get<InvitationRow[]>(
      `/api/trainer/communities/${communityId}/invitations`,
    );
    setRows(data);
    router.refresh();
  }

  async function issueNominative(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
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
          ? "Invitation envoyée, et son lien copié — il ne sera plus affiché."
          : "Invitation créée, lien copié. L'e-mail n'est pas parti : transmettez-le vous-même.",
      );
      setEmail("");
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'invitation n'a pas pu être émise.");
    } finally {
      setPending(false);
    }
  }

  async function issueShareLink() {
    setPending(true);
    try {
      const { data } = await api.post<{ url: string }>(
        `/api/trainer/communities/${communityId}/invitations`,
        { kind: "SHARE_LINK" },
      );
      await copy(data.url, "Lien de parrainage copié.");
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Le lien n'a pas pu être créé.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api.del(`/api/trainer/communities/${communityId}/invitations/${id}`);
      toast.success("Invitation retirée.");
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "La révocation a échoué.");
    }
  }

  return (
    <section className="mt-6 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
      <h2 className="text-[19px] font-extrabold">Inviter</h2>
      <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-2">
        Une invitation nominative s&apos;adresse à une personne et ne sert qu&apos;une fois. Un lien
        de parrainage se recopie et vaut pour plusieurs entrées, au tarif plein.
      </p>

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
          <Btn type="submit" disabled={pending || !email.trim()}>
            <Mail className="size-4" aria-hidden="true" />
            Envoyer l&apos;invitation
          </Btn>
          <Btn type="button" variant="o" onClick={issueShareLink} disabled={pending || isPrivate}>
            <Link2 className="size-4" aria-hidden="true" />
            Lien de parrainage
          </Btn>
        </div>
        {isPrivate ? (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-3">
            Votre salon est fermé : on n&apos;y entre que sur invitation nominative, le lien de
            parrainage y est interdit.
          </p>
        ) : null}
      </form>

      <div className="mt-7 border-t border-line-2 pt-5">
        <h3 className="mb-3.5 text-[15px] font-bold">
          Invitations émises
          <Chip tone="muted" className="ml-2 align-middle font-display">
            {rows.length}
          </Chip>
        </h3>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Gift />}
            title="Aucune invitation"
            description="Les invitations que vous émettez apparaîtront ici, avec leur état."
          />
        ) : (
          <ul className="grid gap-2.5">
            {rows.map((row) => (
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
                      ? `Lien de parrainage · ${row.usesCount}/${row.maxUses} utilisations`
                      : (row.email ?? "adresse effacée")}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">
                    {row.grant === "GIFT" ? `${row.giftMonths} mois offerts · ` : "Tarif plein · "}
                    {row.issuerRole === "MEMBER"
                      ? `partagé par ${row.issuerName ?? "un membre"} · `
                      : ""}
                    expire le {fmtDate(row.expiresAt)}
                  </p>
                </div>

                <StPill tone={STATUS_TONE[row.status] ?? "muted"}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </StPill>

                {row.url ? (
                  <button
                    type="button"
                    onClick={() => copy(row.url!, "Lien copié.")}
                    aria-label="Copier le lien de parrainage"
                    className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-brand hover:text-brand"
                  >
                    <Copy className="size-4" aria-hidden="true" />
                  </button>
                ) : null}

                {row.status === "PENDING" ? (
                  <button
                    type="button"
                    onClick={() => revoke(row.id)}
                    aria-label={`Retirer l'invitation ${row.email ?? row.tokenPrefix}`}
                    className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-ink-2 hover:border-danger hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
