import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { BRAND, TAGLINE } from "@/lib/content";
import { BACKGROUND } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: `${BRAND} — ${TAGLINE}`,
  description:
    "Astera is a brand and interface studio. Identity, art direction, motion and interface, assembled into one system.",
};

export const viewport: Viewport = {
  themeColor: BACKGROUND,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
