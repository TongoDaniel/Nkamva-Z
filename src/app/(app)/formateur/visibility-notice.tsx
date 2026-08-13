import Link from "next/link";
import { AlertTriangle, EyeOff } from "lucide-react";
import type { TrainerVisibility } from "@/lib/trainers";

// ==========================================================================
// « Pourquoi je n'apparais pas dans l'annuaire ? »
// ==========================================================================
// La règle de visibilité (`PUBLIC_TRAINER_WHERE`) n'était énoncée nulle part
// dans l'espace formateur. Un formateur dont la communauté s'affiche en vitrine
// pouvait chercher son nom sur /formateurs, ne pas s'y trouver, et n'avoir
// aucun moyen d'apprendre ce qui manquait — l'hypothèse naturelle étant un
// profil incomplet, qui n'y est pourtant pour rien.
//
// L'encart ne dit pas seulement qu'il manque quelque chose : il dit **quoi**,
// et donne le lien qui le règle. Un avertissement sans geste attaché n'est
// qu'une mauvaise nouvelle.
//
// Il disparaît dès que la visibilité est acquise. Un bandeau permanent finit
// par ne plus être lu, et celui-ci doit encore compter le jour où il revient.
// ==========================================================================

/** Le geste manquant, choisi par ce qui bloque réellement. */
function missingStep(visibility: TrainerVisibility): {
  title: string;
  body: string;
  action: { href: string; label: string } | null;
  tone: "warn" | "bad";
} | null {
  if (visibility.visible) return null;

  if (visibility.suspended) {
    return {
      tone: "bad",
      title: "Votre profil est retiré des surfaces publiques",
      body:
        "Votre compte formateur est suspendu : ni votre fiche, ni vos ressources, ni vos " +
        "communautés n'apparaissent aux visiteurs. Vos acheteurs gardent l'accès à ce qu'ils ont payé.",
      action: { href: "/formateur/litiges", label: "Voir mes litiges" },
    };
  }

  if (!visibility.approved) {
    return {
      tone: "warn",
      title: "Votre profil formateur attend sa validation",
      body:
        "Vous pouvez préparer vos ressources dès maintenant : elles resteront en brouillon " +
        "jusqu'à l'examen de votre candidature, et rien n'est visible des visiteurs d'ici là.",
      action: { href: "/candidature", label: "Suivre ma candidature" },
    };
  }

  // Approuvé, non suspendu, mais rien à montrer. Ouvrir ce qu'on a déjà passe
  // avant créer ce qu'on n'a pas : c'est le geste le moins coûteux.
  if (visibility.hiddenCommunityCount > 0) {
    return {
      tone: "warn",
      title: "Votre communauté est fermée aux visiteurs",
      body:
        "Elle est privée ou n'est pas ouverte : personne ne peut la trouver, et vous " +
        "n'apparaissez pas non plus dans l'annuaire des formateurs. L'ouvrir suffit à rendre les deux visibles.",
      action: { href: "/formateur/communaute", label: "Ouvrir ma communauté" },
    };
  }

  return {
    tone: "warn",
    title: "Vous n'apparaissez pas encore dans l'annuaire des formateurs",
    body:
      "Un profil entre dans l'annuaire dès qu'il a quelque chose à montrer : une ressource " +
      "publiée au catalogue, ou une communauté ouverte. Tant qu'aucune des deux n'existe, " +
      "les visiteurs ne peuvent pas vous trouver.",
    action: { href: "/formateur/ressources/nouvelle", label: "Publier une ressource" },
  };
}

/**
 * L'encart de visibilité de l'accueil formateur. Rend `null` — donc rien du
 * tout, pas même un espace — quand le formateur est visible.
 */
export function VisibilityNotice({ visibility }: { visibility: TrainerVisibility }) {
  const step = missingStep(visibility);
  if (!step) return null;

  const Icon = step.tone === "bad" ? AlertTriangle : EyeOff;

  return (
    <div
      className={
        step.tone === "bad"
          ? "mb-8 flex flex-wrap items-start gap-3.5 rounded-nk-lg border border-danger/30 bg-danger/5 px-5 py-4"
          : "mb-8 flex flex-wrap items-start gap-3.5 rounded-nk-lg border border-gold/30 bg-gold-tint px-5 py-4"
      }
    >
      <span
        className={step.tone === "bad" ? "mt-0.5 text-danger" : "mt-0.5 text-gold-ink"}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-[240px] flex-1">
        <b className="block text-[14.5px] font-bold text-ink">{step.title}</b>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{step.body}</p>
        {step.action ? (
          <Link
            href={step.action.href}
            className="mt-2.5 inline-block text-[13px] font-bold text-brand hover:text-brand-dark"
          >
            {step.action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
