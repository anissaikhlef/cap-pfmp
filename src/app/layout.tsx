import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cap PFMP", template: "%s · Cap PFMP" },
  description: "Gestion des périodes de formation en milieu professionnel",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
