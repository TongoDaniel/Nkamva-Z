"use client";

import * as React from "react";
import { Flag } from "lucide-react";
import { Btn } from "@/components/nk/button";
import { Modal } from "@/components/nk/modal";
import { toast } from "@/components/nk/toast";
import { api, ApiError } from "@/lib/client";
import { cn } from "@/lib/utils";

/**
 * Point d'entrée du signalement — le maillon qui manquait.
 *
 * `POST /api/reports`, `createReport()`, la file `/admin/signalements`, son écran
 * de détail et sa résolution existaient tous, testés, depuis le Lot 1 : rien
 * dans l'interface ne postait dessus. La Modération instruisait donc des
 * signalements que seul le jeu de démonstration pouvait créer.
 *
 * Un seul composant pour les cinq surfaces de `ReportTargetType`, parce que le
 * modèle est générique à dessein : la Modération doit pouvoir répondre à
 * « montre-moi tout ce qui est signalé », ce qu'un formulaire par surface
 * rendrait impossible à tenir.
 */
export type ReportTargetType =
  | "COURSE"
  | "USER"
  | "COMMUNITY"
  | "COMMUNITY_POST"
  | "COMMUNITY_POST_REPLY"
  | "MESSAGE"
  | "LIVE_MESSAGE"
  | "DISPUTE_MESSAGE";

/**
 * Les six motifs de `ReportReason`, dans l'ordre où ils se posent réellement :
 * l'illégal d'abord, le fourre-tout en dernier. L'ordre de l'énumération Prisma
 * n'est pas un ordre de lecture.
 */
const REASONS: Array<{ value: string; label: string }> = [
  { value: "ILLEGAL", label: "Contenu illégal" },
  { value: "INTELLECTUAL_PROPERTY", label: "Violation de droits d'auteur" },
  { value: "MISLEADING", label: "Contenu trompeur ou mensonger" },
  { value: "HARASSMENT", label: "Harcèlement ou propos haineux" },
  { value: "SPAM", label: "Spam ou publicité" },
  { value: "OTHER", label: "Autre motif" },
];

/** Ce que le formulaire annonce signaler. Le libellé porte l'objet, pas le type. */
const WHAT: Record<ReportTargetType, string> = {
  COURSE: "cette ressource",
  USER: "ce compte",
  COMMUNITY: "cette communauté",
  COMMUNITY_POST: "ce message",
  COMMUNITY_POST_REPLY: "cette réponse",
  MESSAGE: "ce message",
  LIVE_MESSAGE: "ce message du salon",
  DISPUTE_MESSAGE: "ce message de litige",
};

export function ReportButton({
  targetType,
  targetId,
  /** Nom de l'objet, pour l'intitulé accessible : « Signaler « Wax et couture » ». */
  name,
  /**
   * `link` pour les fiches, où le signalement est une ligne en bas de panneau ;
   * `icon` pour les fils, où il se range à côté de l'épingle et de la corbeille.
   * Un libellé en toutes lettres sous chaque message transformerait le fil en
   * invitation à signaler.
   */
  variant = "link",
  className,
}: {
  targetType: ReportTargetType;
  targetId: string;
  name?: string;
  variant?: "link" | "icon";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [detail, setDetail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const what = WHAT[targetType];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) {
      toast.error("Choisissez un motif.");
      return;
    }
    setPending(true);
    try {
      await api.post("/api/reports", {
        targetType,
        targetId,
        reason,
        // Une chaîne vide n'est pas « pas de précision » : la route attend
        // l'absence de champ, et `detail: ""` serait stocké tel quel.
        ...(detail.trim() ? { detail: detail.trim() } : {}),
      });
      setSent(true);
      setOpen(false);
      toast.success("Signalement transmis à la modération.");
    } catch (err) {
      // Les messages de domaine viennent du serveur et sont déjà en français
      // (« Vous avez déjà signalé cet élément », « Trop de signalements… ») : les
      // réécrire ici ferait deux vérités pour une seule règle. Seul le 401 est
      // traité à part, parce qu'il appelle une action et non une explication.
      toast.error(
        err instanceof ApiError
          ? err.status === 401
            ? "Connectez-vous pour signaler ce contenu."
            : err.message
          : "Le signalement n'a pas été transmis. Réessayez.",
      );
    } finally {
      setPending(false);
    }
  }

  const label = `Signaler ${what}`;

  if (sent) {
    // En pied de fiche, l'accusé se lit en toutes lettres. Dans un fil, il ne
    // reste que le drapeau éteint : une phrase par message signalé afficherait
    // au voisinage ce que le lecteur a fait.
    return variant === "icon" ? (
      <span
        title="Signalement transmis à la modération."
        className={cn("grid size-8 shrink-0 place-items-center text-danger", className)}
      >
        <Flag className="size-4" aria-hidden="true" />
        <span className="sr-only">Signalement transmis à la modération.</span>
      </span>
    ) : (
      <p className={cn("flex items-center gap-2 text-[13px] font-semibold text-ink-3", className)}>
        <Flag className="size-3.5 shrink-0" aria-hidden="true" />
        Signalement transmis à la modération.
      </p>
    );
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          className={cn(
            "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 transition hover:bg-danger-tint hover:text-danger",
            className,
          )}
        >
          <Flag className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-danger",
            className,
          )}
        >
          <Flag className="size-3.5 shrink-0" aria-hidden="true" />
          {label}
        </button>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Signaler ${what}`}
        description={
          name
            ? `« ${name} » sera transmis à la modération, qui décidera seule de la suite.`
            : "Votre signalement sera transmis à la modération, qui décidera seule de la suite."
        }
      >
        <form onSubmit={submit}>
          <div className="mb-4">
            <label htmlFor="report-reason" className="mb-1.5 block text-[13.5px] font-bold text-ink">
              Motif
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="w-full cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/25"
            >
              <option value="">Choisissez un motif…</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-1">
            <label htmlFor="report-detail" className="mb-1.5 block text-[13.5px] font-bold text-ink">
              Précisions <span className="font-medium text-ink-3">(facultatif)</span>
            </label>
            <textarea
              id="report-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ce qui vous a alerté, et où le retrouver."
              className="w-full resize-y rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] font-medium text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-[3px] focus:ring-brand/25"
            />
            <p className="mt-1 text-right text-[13px] text-ink-3">{detail.length}/2000</p>
          </div>

          {/* Le rappel du litige ne vaut que là où il y a eu un paiement :
              sous un message de fil, il n'aurait aucun sens. */}
          {targetType === "COURSE" || targetType === "COMMUNITY" ? (
            <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
              Un signalement n&apos;est pas une demande de remboursement : si vous avez acheté
              cette ressource et qu&apos;elle ne correspond pas, ouvrez un litige depuis
              « Mes achats ».
            </p>
          ) : (
            <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
              L&apos;auteur du message n&apos;est pas prévenu de votre signalement.
            </p>
          )}

          <div className="flex flex-col gap-2.5">
            <Btn type="submit" block loading={pending}>
              Envoyer le signalement
            </Btn>
            <Btn type="button" variant="t" block onClick={() => setOpen(false)}>
              Annuler
            </Btn>
          </div>
        </form>
      </Modal>
    </>
  );
}
