import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Multiplication Trainer", template: "%s · Multiplication Trainer" },
  description: "A professional tool for improving multiplication speed and accuracy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background text-foreground flex flex-col`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 min-h-16 py-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <Link href="/" className="font-bold tracking-tight">
                Multiplication <span className="text-primary">Trainer</span>
              </Link>
              <div className="flex items-center gap-4">
                <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium">
                  <Link href="/" className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150">Practice</Link>
                  <Link href="/progress" className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150">Progress</Link>
                  <Link href="/tables" className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150">Tables</Link>
                  <Link href="/settings" className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150">Settings</Link>
                </nav>
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="flex-1 container mx-auto px-4 py-8">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
