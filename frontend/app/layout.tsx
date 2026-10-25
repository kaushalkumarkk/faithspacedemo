import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/shell";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faith Space — Technical Proof of Concept",
  description: "An inclusive multi-faith media & community platform. Technical proof of concept by DevNexa.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
