import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "First AI", template: "%s · First AI" },
  description: "Système d’exploitation pour les opérations métier.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
