"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gift, ShieldBan, ShieldCheck, Users } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Chip } from "@/components/nk/chip";
import { StPill } from "@/components/nk/status-pill";
import { Avatar } from "@/components/nk/avatar";
import { EmptyState } from "@/components/nk/empty-state";
import { Modal } from "@/components/nk/modal";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
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

export function MembersPanel({
  communityId,
  initial,
}: {
  communityId: string;
  initial: MemberRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initial);
  const [target, setTarget] = React.useState<MemberRow | null>(null);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => setRows(initial), [initial]);

  async function reload() {
    const { data } = await api.get<MemberRow[]>(
      `/api/trainer/communities/${communityId}/members`,
    );
    setRows(data);
    router.refresh();
  }

  async function ban() {
    if (!target) return;
    setPending(true);
    try {
      await api.post(`/api/trainer/communities/${communityId}/members`, {
        learnerId: target.learnerId,
        action: "BAN",
        reason: reason.trim(),
      });
      toast.success(`${target.fullName ?? "Ce membre"} ne peut plus écrire dans le salon.`);
      setTarget(null);
      setReason("");
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action a échoué.");
    } finally {
      setPending(false);
    }
  }

  async function unban(row: MemberRow) {
    try {
      await api.post(`/api/trainer/communities/${communityId}/members`, {
        learnerId: row.learnerId,
        action: "UNBAN",
      });
      toast.success(`${row.fullName ?? "Ce membre"} peut de nouveau écrire.`);
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action a échoué.");
    }
  }

  return (
    <section className="mt-6 rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm sm:p-8">
      <h2 className="text-[19px] font-extrabold">
        Membres
        <Chip tone="muted" className="ml-2 align-middle font-display">
          {rows.length}
        </Chip>
      </h2>
      <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-2">
        Bannir retire la parole, pas l&apos;accès : le membre continue de lire le salon et ses
        ressources incluses jusqu&apos;au terme de la période qu&apos;il a réglée. Lui couper ce
        qu&apos;il a payé serait une sanction financière, et c&apos;est au remboursement de traiter
        ces cas.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Users />}
          title="Aucun membre pour l'instant"
          description="Les adhésions apparaîtront ici, avec leur état et leur échéance."
        />
      ) : (
        <ul className="mt-6 grid gap-2.5">
          {rows.map((row) => {
            const state = STATUS[row.status] ?? { label: row.status, tone: "muted" as const };
            const isBanned = row.status === "BANNED";
            return (
              <li
                key={row.learnerId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-nk border border-line px-4 py-3"
              >
                <Avatar name={row.fullName ?? "Membre"} size="sm" />
                <div className="min-w-[180px] flex-1">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                    {row.fullName ?? "Membre"}
                    {row.viaInvitation ? (
                      <span title="Entré par une invitation">
                        <Gift className="size-3.5 text-ink-3" aria-label="Entré par invitation" />
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">
                    {row.canceledAt ? "Résiliée · accès jusqu'au " : "Échéance le "}
                    {fmtDate(row.periodEnd)}
                  </p>
                  {isBanned && row.bannedReason ? (
                    <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-danger">
                      {row.bannedReason}
                    </p>
                  ) : null}
                </div>

                <StPill tone={state.tone}>{state.label}</StPill>

                {isBanned ? (
                  <Btn variant="o" size="sm" onClick={() => unban(row)}>
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
              </li>
            );
          })}
        </ul>
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
        <p className="mt-1.5 text-[12.5px] text-ink-3">Dix caractères au minimum.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Btn variant="o" onClick={() => setTarget(null)}>
            Annuler
          </Btn>
          <Btn onClick={ban} disabled={pending || reason.trim().length < 10}>
            {pending ? "…" : "Bannir du salon"}
          </Btn>
        </div>
      </Modal>
    </section>
  );
}
