import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DEBUG 2026",
  description: "DEBUG · студенттерге арналған онлайн кодинг жарысы",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="kk">
      <head>
        <link rel="preload" href="/fonts/jetbrains-mono-2.304-kz.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
