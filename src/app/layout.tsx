import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Manrope (display + body) + JetBrains Mono (data: IDs, refs, dates, money).
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kalari Tours and Travels — Your Journey, Handled Right",
  description: "PRO services CRM — cases, invoicing and follow-up.",
  icons: { icon: "/icon.png", shortcut: "/favicon.ico", apple: "/icon.png" },
};

// Root layout is fonts + <body> only. The app shell lives in (app)/layout.tsx so
// that /login and /portal/[token] can render bare — the portal is opened by
// customers with no session and must never see the shell.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
