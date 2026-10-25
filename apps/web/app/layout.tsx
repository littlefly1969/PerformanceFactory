import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/app/components/language-provider";
import { PwaSetup } from "@/app/components/pwa-setup";

export const metadata: Metadata = {
  title: "PerformanceFactory",
  description: "Piattaforma per pianificazione e revisione della performance",
  applicationName: "Performance Factory",
  // iOS non legge il manifest per icona e barra di stato dell'app installata.
  appleWebApp: {
    capable: true,
    title: "PF",
    statusBarStyle: "black",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>
        <PwaSetup />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
