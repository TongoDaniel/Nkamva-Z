import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
