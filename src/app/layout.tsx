import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NkamVa",
  description: "NkamVa — plateforme de formation en ligne : cours, communautés et formateurs.",
  keywords: ["NkamVa", "formation en ligne", "cours", "communauté", "formateurs"],
  authors: [{ name: "NkamVa" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "NkamVa",
    description: "Plateforme de formation en ligne : cours, communautés et formateurs.",
    siteName: "NkamVa",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NkamVa",
    description: "Plateforme de formation en ligne : cours, communautés et formateurs.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${bricolage.variable} ${instrumentSans.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
