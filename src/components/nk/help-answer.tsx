import Link from "next/link";
import {
  BookOpen,
  CreditCard,
  MessageSquare,
  Play,
  Shield,
  UserCog,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AnswerSegment, HelpIconKey } from "@/lib/help-text";

/** Les icônes proposées aux rubriques d'aide — liste fermée, `HELP_ICON_KEYS`. */
export const HELP_ICONS: Record<HelpIconKey, LucideIcon> = {
  play: Play,
  "credit-card": CreditCard,
  users: Users,
  "user-cog": UserCog,
  shield: Shield,
  book: BookOpen,
  video: Video,
  wallet: Wallet,
  message: MessageSquare,
};

/**
 * Une réponse d'aide rendue : texte, et liens vers les pages du site. Jamais de
 * HTML venu de la base — les segments ont été produits par `renderAnswer`, qui
 * n'accepte que des chemins internes.
 */
export function HelpAnswer({ segments }: { segments: AnswerSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "link" ? (
          <Link key={i} href={seg.href} className="font-semibold text-brand underline-offset-2 hover:underline">
            {seg.label}
          </Link>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </>
  );
}
