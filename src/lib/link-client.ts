"use client";

import { extensionType } from "./media";

export type LinkOutcome =
  | { kind: "file"; file: File; sourceUrl: string }
  | { kind: "page"; title?: string; candidates: { url: string; type: "image" | "video" }[] }
  | { kind: "error"; code: string; message: string; platform?: string };

/**
 * Downloads a linked file through /api/fetch-media (browsers can't fetch most
 * cross-site files directly). The file is then checked in the browser, like
 * an upload.
 */
export async function fetchLink(url: string, signal?: AbortSignal): Promise<LinkOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/fetch-media", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ai-label-check": "1" },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch {
    return {
      kind: "error",
      code: "offline",
      message: navigator.onLine ? "Couldn't reach the checker. Try again." : "You're offline. Checking a link needs a connection.",
    };
  }

  if ((res.headers.get("content-type") ?? "").startsWith("application/json")) {
    const body = await res.json().catch(() => null);
    if (body?.kind === "page" || body?.kind === "error") return body as LinkOutcome;
    return { kind: "error", code: "unknown", message: "Something went wrong checking that link." };
  }

  try {
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get("x-file-name") ?? "download");
    const sourceUrl = decodeURIComponent(res.headers.get("x-source-url") ?? url);
    const type = blob.type || extensionType(name) || "";
    return { kind: "file", file: new File([blob], name, { type }), sourceUrl };
  } catch {
    return { kind: "error", code: "network", message: "The download was interrupted. Try again." };
  }
}
