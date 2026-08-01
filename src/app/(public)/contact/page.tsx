import type { Metadata } from "next";
import Link from "next/link";
import { Clock, LifeBuoy, ShieldQuestion } from "lucide-react";
import { PageHead } from "@/components/nk/page-head";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Nous contacter",
  description: "Écrivez au support NkamVa. Réponse sous 24 heures ouvrées.",
};

export default function ContactPage() {
  return (
    <div className="nk-wrap pb-16">
      <PageHead
        crumbs={[{ label: "Accueil", href: "/" }, { label: "Contact" }]}
        title="Nous écrire"
        lead="Une question, un problème, une demande particulière : le support vous répond."
      />

      <div className="grid items-start gap-6 pt-2 lg:grid-cols-[1fr_300px]">
        <ContactForm />

        <aside className="grid gap-4">
          <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
            <span
              className="mb-3 grid size-10 place-items-center rounded-xl bg-brand-tint text-brand"
              aria-hidden="true"
            >
              <Clock className="size-5" />
            </span>
            <h2 className="mb-1.5 text-[15px] font-bold">Délai de réponse</h2>
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              Sous 24 heures ouvrées. Les demandes liées à un paiement en cours sont traitées en
              priorité.
            </p>
          </section>

          <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
            <span
              className="mb-3 grid size-10 place-items-center rounded-xl bg-info-tint text-info"
              aria-hidden="true"
            >
              <LifeBuoy className="size-5" />
            </span>
            <h2 className="mb-1.5 text-[15px] font-bold">Avant d&apos;écrire</h2>
            <p className="mb-3 text-[13.5px] leading-relaxed text-ink-2">
              Le centre d&apos;aide répond déjà aux questions les plus courantes sur l&apos;achat,
              l&apos;accès et les remboursements.
            </p>
            <Link href="/aide" className="text-[13.5px] font-bold text-brand hover:text-brand-dark">
              Consulter le centre d&apos;aide →
            </Link>
          </section>

          <section className="rounded-nk-lg border border-line bg-card p-6 shadow-nk-sm">
            <span
              className="mb-3 grid size-10 place-items-center rounded-xl bg-gold-tint text-gold-ink"
              aria-hidden="true"
            >
              <ShieldQuestion className="size-5" />
            </span>
            <h2 className="mb-1.5 text-[15px] font-bold">Contester un achat</h2>
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              Une contestation ne passe pas par ce formulaire : ouvrez-la depuis « Mes achats »
              pour que le dossier soit suivi et que votre délai de 14 jours soit pris en compte.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
