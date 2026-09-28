import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Content Credentials Validator",
  description:
    "Check an image for C2PA Content Credentials — who signed it, what was done to it, and whether AI was involved. Runs entirely in your browser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col">
        <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
        <header className="relative z-10 border-b border-border/70">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 font-medium tracking-tight">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden>
                <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" />
                <path d="M8.8 12.2l2.2 2.2 4.3-4.6" />
              </svg>
              <span>Credentials Validator</span>
            </Link>
            <span className="hidden items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-valid" aria-hidden />
              Runs locally · files never leave your browser
            </span>
          </div>
        </header>
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
        <footer className="relative z-10 border-t border-border/70">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
            <span>Reads C2PA manifests with the open-source Content Authenticity SDK.</span>
            <span>Credentials show who signed a file — not whether its contents are true.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
