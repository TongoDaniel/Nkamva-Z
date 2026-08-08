import Image from "next/image";
import { cn } from "@/lib/utils";
import type { PayableMarkets } from "@/lib/markets";

/**
 * Moyens de paiement — port de `.pp` / `.payband` / `.pmarq`.
 *
 * Les marques et les pays ne sont plus écrits ici : ils viennent de
 * `payableMarkets()`, donc de ce que le compte marchand encaisse réellement.
 * La liste en dur qui vivait à cet endroit annonçait Wave — non distribué par
 * PawaPay — ainsi que le Mali et le Togo, absents de la configuration.
 *
 * Les logos vivent dans `public/pay/`. Deux fonds sont imposés par les chartes
 * des opérateurs : Orange Money sur noir, MTN sur jaune. Une marque sans logo
 * s'affiche en toutes lettres plutôt que d'emprunter celui d'une autre.
 */

interface Logo {
  src: string;
  alt: string;
  tone: string;
  height: number;
}

/**
 * Correspondance nom commercial → logo. Les clés sont les `displayName` de
 * `/v2/active-conf`. M-Pesa est le **produit** de Vodacom et de Safaricom :
 * c'est ce nom-là que le public connaît, d'où les deux entrées.
 */
const LOGOS: Record<string, Logo> = {
  Orange: { src: "/pay/orange-money.svg", alt: "Orange Money", tone: "bg-black border-black", height: 23 },
  MTN: { src: "/pay/mtn.svg", alt: "MTN MoMo", tone: "bg-[#ffcb05] border-[#eec000]", height: 19 },
  Airtel: { src: "/pay/airtel.svg", alt: "Airtel Money", tone: "bg-white", height: 19 },
  Vodacom: { src: "/pay/m-pesa.png", alt: "M-Pesa", tone: "bg-white", height: 19 },
  Safaricom: { src: "/pay/m-pesa.png", alt: "M-Pesa", tone: "bg-white", height: 19 },
};

/** Taille des puces : `md` sur la landing, `sm` dans un panneau d'achat. */
type PaySize = "sm" | "md" | "lg";

const SIZES: Record<PaySize, { box: string; scale: number }> = {
  sm: { box: "h-[30px] px-2.5 rounded-[9px]", scale: 0.79 },
  md: { box: "h-[46px] px-5 rounded-[13px]", scale: 1 },
  lg: { box: "h-10 px-4 rounded-[13px] border-transparent", scale: 1 },
};

function TextChip({
  label,
  size,
  decorative,
}: {
  label: string;
  size: PaySize;
  decorative?: boolean;
}) {
  return (
    <span
      aria-hidden={decorative || undefined}
      className={cn(
        "flex flex-none items-center whitespace-nowrap border border-line bg-white font-bold tracking-[0.02em] text-ink-2",
        SIZES[size].box,
        size === "sm" ? "text-[11px]" : "text-[13.5px]",
      )}
    >
      {label}
    </span>
  );
}

function PayChip({
  brand,
  size,
  decorative,
}: {
  brand: string;
  size: PaySize;
  decorative?: boolean;
}) {
  const logo = LOGOS[brand];
  if (!logo) return <TextChip label={brand} size={size} decorative={decorative} />;

  const s = SIZES[size];
  return (
    <span
      aria-hidden={decorative || undefined}
      className={cn(
        "flex flex-none items-center gap-2 whitespace-nowrap border border-line",
        s.box,
        logo.tone,
      )}
    >
      <Image
        src={logo.src}
        alt={decorative ? "" : logo.alt}
        width={120}
        height={32}
        style={{ height: Math.round(logo.height * s.scale), width: "auto" }}
        className="block"
      />
    </span>
  );
}

/** Puces des moyens de paiement, pour les panneaux et la CTA finale. */
export function PayChips({
  markets,
  size = "md",
  className,
}: {
  markets: PayableMarkets;
  size?: PaySize;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {markets.brands.map((brand) => (
        <li key={brand}>
          <PayChip brand={brand} size={size} />
        </li>
      ))}
      <li>
        <TextChip label="Carte bancaire" size={size} />
      </li>
    </ul>
  );
}

/** « Cameroun · Côte d'Ivoire · Sénégal » — vide si rien n'est déterminable. */
export function countriesLabel(markets: PayableMarkets): string {
  return markets.countries.map((c) => c.name).join(" · ");
}

/** Frise défilante des moyens de paiement acceptés (`.payband`). */
export function PayBand({ markets }: { markets: PayableMarkets }) {
  // Fournisseur injoignable ou non configuré : on n'annonce rien plutôt qu'une
  // liste périmée. La carte bancaire reste servie par Stripe, mais la frise des
  // opérateurs mobile n'aurait ici aucun contenu vérifié.
  if (!markets.brands.length) return null;

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
            {markets.brands.map((brand) => (
              <PayChip key={brand} brand={brand} size="md" />
            ))}
            <TextChip label="Carte bancaire" size="md" />
            {/* Second exemplaire : purement visuel, il boucle la bande. */}
            {markets.brands.map((brand) => (
              <PayChip key={`${brand}-loop`} brand={brand} size="md" decorative />
            ))}
            <TextChip label="Carte bancaire" size="md" decorative />
          </div>
        </div>
      </div>
      {markets.countries.length ? (
        <p className="nk-wrap pb-[18px] text-[13px] font-medium text-ink-3">
          <b className="font-bold text-ink-2">Disponible :</b> {countriesLabel(markets)}
        </p>
      ) : null}
    </section>
  );
}
