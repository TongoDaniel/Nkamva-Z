import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { AdminHead, AdminCard } from "@/components/layouts/admin-shell";
import { EmptyState } from "@/components/nk/empty-state";
import { StPill } from "@/components/nk/status-pill";
import { getAuthContext } from "@/lib/api";
import { listManualRefundTasks } from "@/lib/dispute-review";
import { fmtDate, fmtFcfa } from "@/lib/format";
import { RefundActions } from "./refund-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Remboursements à exécuter",
  robots: { index: false },
};

const TASK_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  PENDING: { label: "À exécuter", tone: "warn" },
  COMPLETED: { label: "Effectué", tone: "ok" },
  CANCELLED: { label: "Échoué", tone: "bad" },
};

export default async function RemboursementsPage() {
  const auth = await getAuthContext();
  // Décision 7 : la modération décide du remboursement, les finances l'exécutent.
  if (!auth?.user.adminRole || !["FINANCES", "SUPER_ADMIN"].includes(auth.user.adminRole)) {
    redirect("/admin");
  }

  const tasks = await listManualRefundTasks();
  const pending = tasks.filter((t) => t.status === "PENDING");

  return (
    <>
      <AdminHead
        title="Remboursements à exécuter"
        lead="Le repli quand le remboursement automatique n'a pas pu aboutir : ces virements se font à la main, puis se confirment ici."
      />

      <AdminCard title={`${pending.length} en attente`}>
        {tasks.length === 0 ? (
          <EmptyState
            icon={<CheckCheck />}
            title="Rien à exécuter"
            description="Aucun remboursement manuel en file."
          />
        ) : (
          <ul className="flex flex-col">
            {tasks.map((task) => {
              const state = TASK_STATUS[task.status] ?? TASK_STATUS.PENDING;
              const learner = task.dispute.learner.fullName ?? task.dispute.learner.email;
              return (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center gap-4 border-b border-line-2 py-4 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-bold">
                      {task.dispute.purchase?.course?.title ?? "Ressource retirée"}
                    </b>
                    <small className="block truncate text-[12.3px] text-ink-3">
                      {learner} · {task.provider} · ouvert le {fmtDate(task.createdAt)}
                    </small>
                    {task.errorMessage ? (
                      <small className="mt-1 block text-[12.3px] text-danger">
                        Échec : {task.errorMessage}
                      </small>
                    ) : null}
                    {task.notes ? (
                      <small className="mt-1 block text-[12.3px] text-ink-3">{task.notes}</small>
                    ) : null}
                  </div>

                  <StPill tone={state.tone}>{state.label}</StPill>

                  <dl className="flex gap-6 text-right">
                    <div>
                      <dd className="font-display text-[17px] font-extrabold">
                        {fmtFcfa(task.refundAmountFcfa)}
                      </dd>
                      <dt className="text-[12px] text-ink-3">À rembourser</dt>
                    </div>
                    <div>
                      <dd className="font-display text-[17px] font-extrabold">
                        {fmtFcfa(task.trainerDebitFcfa)}
                      </dd>
                      <dt className="text-[12px] text-ink-3">Débit formateur</dt>
                    </div>
                  </dl>

                  {task.status === "PENDING" ? (
                    <RefundActions
                      taskId={task.id}
                      refundAmountFcfa={task.refundAmountFcfa}
                      trainerDebitFcfa={task.trainerDebitFcfa}
                    />
                  ) : task.completedAt ? (
                    <span className="text-[12.5px] text-ink-3">{fmtDate(task.completedAt)}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>
    </>
  );
}
