import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { SITE_NAME, SITE_URL } from "@/lib/site";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Numbers are monospaced throughout so columns of prices line up.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * `metadataBase` is what turns every relative canonical and OG URL into an
 * absolute one. Without it Next warns and emits relative URLs, which search
 * engines and social scrapers cannot resolve.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — PC parts prices in Sri Lanka`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Compare PC part prices across Sri Lankan shops and build a machine from parts that actually work together. Graphics cards, processors, motherboards, memory, drives, power supplies and cases, updated daily.",
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    siteName: SITE_NAME,
    locale: "en_LK",
    type: "website",
    url: SITE_URL,
  },
  twitter: { card: "summary" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  category: "shopping",
};

export const viewport: Viewport = {
  themeColor: "#f2f4f9",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-LK" className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="min-h-full font-[family-name:var(--font-sans)] antialiased">
        {children}
      </body>
    </html>
  );
}
