"use client";

const MAX_REPORTS_PER_PAGE = 5;
const sent = new Set<string>();

/**
 * Sends a crash report to /api/report-error (production only). Only the
 * error and the page path are sent: never file names, contents or links.
 */
export function reportError(error: unknown, kind: string, digest?: string): void {
  if (process.env.NODE_ENV !== "production") return;
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const key = `${kind}:${err.message}`;
  if (sent.has(key) || sent.size >= MAX_REPORTS_PER_PAGE) return;
  sent.add(key);

  const body = JSON.stringify({
    message: err.message,
    stack: err.stack,
    kind,
    digest,
    path: window.location.pathname,
  });
  fetch("/api/report-error", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ai-label-check": "1" },
    body,
    keepalive: true,
  }).catch(() => {});
}
