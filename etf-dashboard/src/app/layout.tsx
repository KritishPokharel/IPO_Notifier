import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Nav } from "@/components/dashboard/nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ETF Tracker — Market Analysis & Drop Alerts",
  description: "Track 12 ETFs, drawdowns, historical performance and validated price-drop alerts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider delayDuration={150}>
            <Nav />
            <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">{children}</main>
            <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted-foreground">
              Informational only, not investment advice. Prices come from third-party data providers and may be delayed; each value
              shows its source, timestamp and verification status.
            </footer>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
