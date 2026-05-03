import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/app/components/language-provider";

export const metadata: Metadata = {
  title: "PerformanceFactory",
  description: "Piattaforma per pianificazione e revisione della performance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
