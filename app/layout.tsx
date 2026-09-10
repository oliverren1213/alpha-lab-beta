import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;

  return {
    title: "Alpha Lab Beta",
    description: "An auditable investment ledger, portfolio analyzer and decision journal.",
    applicationName: "Alpha Lab Beta",
    robots: { index: true, follow: true },
    openGraph: {
      title: "Alpha Lab Beta",
      description: "Know what moved the portfolio, and why.",
      type: "website",
      images: [{ url: image, width: 1731, height: 909, alt: "Alpha Lab Beta" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Alpha Lab Beta",
      description: "Know what moved the portfolio, and why.",
      images: [image],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#101216" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
