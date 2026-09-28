"use client";

import { useEffect, useState } from "react";
import { preloadValidator } from "@/lib/c2pa-client";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Registers the service worker and offers an install button where the browser
 * supports it. Renders nothing when there's nothing to offer.
 */
export default function AppShell() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // In dev the worker's caching would fight hot reloading.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed", err);
      });
    }

    // Installed apps should work offline from the first launch, so fetch the
    // validator in the background. In a browser tab it loads on first use.
    if (isStandalone()) {
      const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
      idle(() => preloadValidator());
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await installEvent.prompt();
        await installEvent.userChoice;
        setInstallEvent(null);
      }}
      className="flex items-center gap-2 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background hover:bg-foreground/90"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 4v11" />
        <path d="M7.5 10.5L12 15l4.5-4.5" />
        <path d="M5 19h14" />
      </svg>
      Install app
    </button>
  );
}
