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
    default: "NkamVa — le savoir africain, à l'unité et en FCFA",
    template: "%s — NkamVa",
  },
  description:
    "Cours vidéo, guides et modèles créés par des formateurs africains. Achetez une fois par mobile money ou carte bancaire — la ressource reste à vous, à vie.",
  keywords: ["NkamVa", "formation en ligne", "cours", "communauté", "formateurs", "FCFA"],
  authors: [{ name: "NkamVa" }],
  icons: { icon: "/logo.svg" },
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
  themeColor: "#f6f3ec",
  width: "device-width",
  initialScale: 1,
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
