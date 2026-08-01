"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";
import { DISPUTE_REASONS, INELIGIBILITY } from "../mes-litiges/dispute-status";

interface Eligibility {
  eligible: boolean;
  reason?: string;
  daysSincePurchase: number;
  assessment: { consumptionPercent: number; ruleApplies: boolean; downloaded: boolean | null };
}

const MIN_DETAIL = 20;

/**
 * Contestation d'un achat. La recevabilité est demandée à l'ouverture de la
 * fenêtre, avant toute saisie : on explique pourquoi c'est impossible plutôt
 * que de laisser remplir un formulaire voué au refus.
 */
export function DisputeButton({
  purchaseId,
  courseTitle,
}: {
  purchaseId: string;
  courseTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [eligibility, setEligibility] = React.useState<Eligibility | null>(null);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState<string>(DISPUTE_REASONS[0].value);
  const [detail, setDetail] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function onOpen() {
    setOpen(true);
    setChecking(true);
    setEligibility(null);
    setBlocked(null);
    try {
      const { data } = await api.get<Eligibility>(
        `/api/me/disputes/eligibility?purchaseId=${encodeURIComponent(purchaseId)}`,
      );
      setEligibility(data);
    } catch (err) {
      setBlocked(err instanceof ApiError ? err.message : "Vérification impossible.");
    } finally {
      setChecking(false);
    }
  }

  async function onSubmit() {
    setPending(true);
    try {
      const { data } = await api.post<{ id: string }>("/api/me/disputes", {
        purchaseId,
        reason,
        reasonDetail: detail.trim(),
      });
      toast.success("Contestation ouverte. Le support vous répondra dans le fil.");
      setOpen(false);
      router.push(`/mes-litiges/${data.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'ouverture a échoué.");
      setPending(false);
    }
  }

  const refusal = eligibility && !eligibility.eligible ? eligibility.reason : null;
  const canSubmit = eligibility?.eligible && detail.trim().length >= MIN_DETAIL;

  return (
    <>
      <Btn variant="t" size="sm" onClick={onOpen}>
        <ShieldAlert aria-hidden="true" />
        Contester
      </Btn>

      <Modal
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Contester cet achat"
        description={courseTitle}
        footer={
          eligibility?.eligible ? (
            <>
              <Btn loading={pending} disabled={!canSubmit} onClick={onSubmit}>
                Ouvrir la contestation
              </Btn>
              <Btn variant="o" onClick={() => setOpen(false)}>
                Annuler
              </Btn>
            </>
          ) : (
            <Btn variant="o" onClick={() => setOpen(false)}>
              Fermer
            </Btn>
          )
        }
      >
        {checking ? (
          <p className="py-6 text-center text-[14px] text-ink-2" aria-live="polite">
            Vérification en cours…
          </p>
        ) : blocked ? (
          <p className="rounded-nk bg-danger-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-danger">
            {blocked}
          </p>
        ) : refusal ? (
          <div className="flex items-start gap-3 rounded-nk bg-gold-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-gold-ink">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {INELIGIBILITY[refusal] ?? "Cet achat ne peut pas être contesté."}
              {eligibility?.assessment.ruleApplies ? (
                <span className="mt-2 block text-[12.5px]">
                  Part consultée relevée : {eligibility.assessment.consumptionPercent} %.
                </span>
              ) : null}
            </span>
          </div>
        ) : eligibility ? (
          <>
            <p className="mb-5 rounded-nk bg-brand-tint px-4 py-3.5 text-[13px] leading-relaxed text-brand-dark">
              Pendant l&apos;examen, votre accès à la ressource est suspendu et la part
              correspondante du formateur est gelée. Si la contestation n&apos;est pas retenue,
              l&apos;accès vous est rendu.
            </p>

            <fieldset className="mb-[18px]">
              <legend className="mb-2.5 text-[13.5px] font-bold text-ink">Motif</legend>
              <div className="grid gap-2">
                {DISPUTE_REASONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-nk border-[1.5px] px-4 py-2.5 text-[14px] transition",
                      reason === option.value
                        ? "border-brand bg-brand-tint"
                        : "border-line hover:border-ink-3",
                    )}
                  >
                    <input
                      type="radio"
                      name="dispute-reason"
                      value={option.value}
                      checked={reason === option.value}
                      onChange={() => setReason(option.value)}
                      className="size-4 shrink-0 accent-brand"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label htmlFor="dispute-detail" className="mb-1.5 block text-[13.5px] font-bold text-ink">
              Ce qui s&apos;est passé
            </label>
            <textarea
              id="dispute-detail"
              rows={4}
              maxLength={5000}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Décrivez précisément le problème rencontré."
              aria-describedby="dispute-detail-hint"
              className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
            />
            <p id="dispute-detail-hint" className="mt-1.5 text-[12.5px] text-ink-3">
              {detail.trim().length < MIN_DETAIL
                ? `Encore ${MIN_DETAIL - detail.trim().length} caractères.`
                : "Ce texte n'est lu que par vous et par le support — jamais par le formateur."}
            </p>
          </>
        ) : null}
      </Modal>
    </>
  );
}
