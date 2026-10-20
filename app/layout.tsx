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
      <body>
        {children}
        {process.env.NEXT_PUBLIC_API_MODE === "mock" && (
          <div aria-label="mock режимі" style={{ position: "fixed", right: 12, bottom: 12, zIndex: 50, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--warn)", color: "var(--warn)", fontSize: 11, letterSpacing: "0.14em", background: "rgba(7,11,16,.85)" }}>
            MOCK
          </div>
        )}
      </body>
    </html>
  );
}
