import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Moyens de paiement — port de `.pp` / `.payband` / `.pmarq`.
 * Les logos vivent dans `public/pay/`. Deux fonds sont imposés par les chartes
 * des opérateurs : Orange Money sur noir, MTN sur jaune.
 */

const METHODS = [
  { src: "/pay/orange-money.svg", alt: "Orange Money", tone: "bg-black border-black", height: 23 },
  { src: "/pay/mtn.svg", alt: "MTN MoMo", tone: "bg-[#ffcb05] border-[#eec000]", height: 19 },
  { src: "/pay/wave.png", alt: "Wave", tone: "bg-white", height: 23 },
  { src: "/pay/airtel.svg", alt: "Airtel Money", tone: "bg-white", height: 19 },
  { src: "/pay/m-pesa.png", alt: "M-Pesa", tone: "bg-white", height: 19 },
] as const;

export const PAY_COUNTRIES =
  "Cameroun · Sénégal · Côte d'Ivoire · Bénin · Mali · Burkina Faso · Togo · Gabon · RDC · Kenya";

/** Taille des puces : `md` sur la landing, `sm` dans un panneau d'achat. */
type PaySize = "sm" | "md" | "lg";

const SIZES: Record<PaySize, { box: string; scale: number }> = {
  sm: { box: "h-[30px] px-2.5 rounded-[9px]", scale: 0.79 },
  md: { box: "h-[46px] px-5 rounded-[13px]", scale: 1 },
  lg: { box: "h-10 px-4 rounded-[13px] border-transparent", scale: 1 },
};

function PayChip({
  method,
  size,
  decorative,
}: {
  method: (typeof METHODS)[number];
  size: PaySize;
  decorative?: boolean;
}) {
  const s = SIZES[size];
  const height = Math.round(method.height * s.scale);
  return (
    <span
      aria-hidden={decorative || undefined}
      className={cn(
        "flex flex-none items-center gap-2 whitespace-nowrap border border-line",
        s.box,
        method.tone,
      )}
    >
      <Image
        src={method.src}
        alt={decorative ? "" : method.alt}
        width={120}
        height={32}
        style={{ height, width: "auto" }}
        className="block"
      />
    </span>
  );
}

function CardChip({ size, decorative }: { size: PaySize; decorative?: boolean }) {
  return (
    <span
      aria-hidden={decorative || undefined}
      className={cn(
        "flex flex-none items-center whitespace-nowrap border border-line bg-white font-bold tracking-[0.02em] text-ink-2",
        SIZES[size].box,
        size === "sm" ? "text-[11px]" : "text-[13.5px]",
      )}
    >
      Carte bancaire
    </span>
  );
}

/** Liste statique des puces, pour les panneaux et la CTA finale. */
export function PayChips({ size = "md", className }: { size?: PaySize; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {METHODS.map((m) => (
        <li key={m.alt}>
          <PayChip method={m} size={size} />
        </li>
      ))}
      <li>
        <CardChip size={size} />
      </li>
    </ul>
  );
}

/** Frise défilante des moyens de paiement acceptés (`.payband`). */
export function PayBand() {
  return (
    <section className="border-y border-line bg-card" aria-labelledby="nk-payband">
      <div className="nk-wrap flex flex-col items-start gap-3.5 py-5 sm:flex-row sm:items-center sm:gap-[26px]">
        <h2
          id="nk-payband"
          className="max-w-[150px] flex-none font-sans text-xs font-bold uppercase leading-normal tracking-[0.12em] text-ink-3"
        >
          Paiements acceptés
        </h2>
        <div
          className="nk-fade-x nk-marquee-pause w-full min-w-0 flex-1 overflow-hidden"
          style={{ "--nk-marquee-duration": "30s" } as React.CSSProperties}
        >
          <div className="nk-marquee items-center gap-3">
            {METHODS.map((m) => (
              <PayChip key={m.alt} method={m} size="md" />
            ))}
            <CardChip size="md" />
            {/* Second exemplaire : purement visuel, il boucle la bande. */}
            {METHODS.map((m) => (
              <PayChip key={`${m.alt}-loop`} method={m} size="md" decorative />
            ))}
            <CardChip size="md" decorative />
          </div>
        </div>
      </div>
      <p className="nk-wrap pb-[18px] text-[13px] font-medium text-ink-3">
        <b className="font-bold text-ink-2">Disponible :</b> {PAY_COUNTRIES}
      </p>
    </section>
  );
}
