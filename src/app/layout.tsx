import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NkamVa — Prêt à apprendre ou à transmettre ?",
    template: "%s — NkamVa",
  },
  description:
    "Cours vidéo, guides et modèles créés par des formateurs africains. Achetez une fois par mobile money ou carte bancaire — la ressource reste à vous, à vie.",
  keywords: ["NkamVa", "formation en ligne", "cours", "communauté", "formateurs", "FCFA"],
  authors: [{ name: "NkamVa" }],
  applicationName: "NkamVa",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "NkamVa",
    // `default` garde la barre d'état lisible sur le papier chaud ; `black`
    // la rendrait illisible et `black-translucent` ferait passer le contenu
    // sous l'encoche.
    statusBarStyle: "default",
  },
  // Les numéros de téléphone détectés par Safari sont rendus en bleu iOS et
  // cassent la typographie des fiches formateur.
  formatDetection: { telephone: false },
  openGraph: {
    title: "NkamVa",
    description: "Plateforme de formation en ligne : cours, communautés et formateurs.",
    siteName: "NkamVa",
    type: "website",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "NkamVa",
    description: "Plateforme de formation en ligne : cours, communautés et formateurs.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1620" },
  ],
  width: "device-width",
  initialScale: 1,
  // `viewport-fit: cover` fait passer la page sous l'encoche ; les retraits
  // sont repris par les `env(safe-area-inset-*)` de `globals.css`.
  viewportFit: "cover",
  // Ni `maximumScale` ni `userScalable: false` : brider le zoom est un défaut
  // d'accessibilité (WCAG 1.4.4). Le zoom involontaire d'iOS se règle par le
  // plancher de 16 px sur les champs, pas en interdisant le geste.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${bricolage.variable} ${instrument.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
