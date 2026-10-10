import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InstallPrompt } from "@/components/install-prompt";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { getCurrentUser } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Mathz · Mental maths practice", template: "%s · Mathz" },
  description:
    "Build mental-maths speed with adaptive practice in multiplication, percentages, fractions and squares, plus spaced repetition and detailed progress tracking.",
  applicationName: "Mathz",
  appleWebApp: { capable: true, title: "Mathz", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the layout extend under notches; the safe-area insets in globals.css keep content clear of them.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

/**
 * Chromium announces that the app is installable (`beforeinstallprompt`) once, and often before React has
 * hydrated. This script runs first, keeps the event, and tells the install banner when it arrives.
 */
const captureInstallPrompt = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__mathzInstallEvent=e;window.dispatchEvent(new Event("mathz:installable"))});`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The header only needs to know whether anyone is signed in. If the database is unreachable the
  // page itself reports the problem; the shell should still render.
  const user = await getCurrentUser().catch(() => null);

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Script id="capture-install-prompt" strategy="beforeInteractive">
            {captureInstallPrompt}
          </Script>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
          >
            Skip to content
          </a>
          <SiteHeader signedIn={user !== null} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <InstallPrompt />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
