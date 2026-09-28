"use client";

import { useId, useRef, useState } from "react";
import { fetchLink, type LinkOutcome } from "@/lib/link-client";

type Status =
  | { state: "idle" }
  | { state: "loading"; url: string }
  | { state: "done"; outcome: Exclude<LinkOutcome, { kind: "file" }> };

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40 ? `${u.pathname.slice(0, 37)}…` : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}

/** "Check a link": downloads a linked file through the server, then checks it like an upload. */
export default function LinkChecker({ onFile }: { onFile: (file: File, sourceUrl: string) => void }) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const abort = useRef<AbortController | null>(null);
  const inputId = useId();

  const check = async (target: string) => {
    const trimmed = target.trim();
    if (!trimmed) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ state: "loading", url: trimmed });
    const outcome = await fetchLink(trimmed, controller.signal);
    if (controller.signal.aborted) return;
    if (outcome.kind === "file") {
      setStatus({ state: "idle" });
      onFile(outcome.file, outcome.sourceUrl);
    } else {
      setStatus({ state: "done", outcome });
    }
  };

  const loading = status.state === "loading";

  return (
    <section className="rounded-2xl border border-border bg-surface p-5" aria-labelledby={`${inputId}-title`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void check(url);
        }}
      >
        <label htmlFor={inputId} id={`${inputId}-title`} className="text-sm font-medium">
          Or check a link to an image, video or audio file
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            type="url"
            inputMode="url"
            required
            placeholder="https://example.com/photo.jpg"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            data-testid="link-input"
            className="h-11 w-full min-w-0 rounded-xl sm:flex-1 border border-border bg-surface-2 px-4 font-mono text-sm text-foreground placeholder:text-muted/70 focus:outline focus:outline-2 focus:outline-accent"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-11 shrink-0 rounded-xl bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
          >
            {loading ? "Fetching…" : "Check link"}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Direct file links, and Dropbox and Google Drive share links, work best. We download the file through our
          server to check it, and don&apos;t keep it. Instagram, TikTok, YouTube and X
          remove Content Credentials, so look for their own AI label on those posts.
        </p>
      </form>

      <div aria-live="polite">
        {status.state === "done" && status.outcome.kind === "error" && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              status.outcome.code === "social" ? "border-warn/40 bg-warn/[0.06]" : "border-border bg-surface-2"
            }`}
            data-testid="link-error"
            data-code={status.outcome.code}
          >
            {status.outcome.code === "social" && (
              <p className="mb-1 font-semibold">{status.outcome.platform} posts can&apos;t be checked here</p>
            )}
            <p className="leading-relaxed text-foreground/85">{status.outcome.message}</p>
          </div>
        )}

        {status.state === "done" && status.outcome.kind === "page" && (
          <div className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm" data-testid="link-page">
            <p className="font-semibold">That link is a web page, not a file.</p>
            {status.outcome.candidates.length > 0 ? (
              <>
                <p className="mt-1 text-muted">
                  It features {status.outcome.candidates.length === 1 ? "this" : "these"}. Pick one to check; a page&apos;s
                  preview image is often a smaller copy without credentials, so the original file is better if you can
                  find it.
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {status.outcome.candidates.map((c) => (
                    <li key={c.url}>
                      <button
                        type="button"
                        onClick={() => void check(c.url)}
                        className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:bg-surface"
                      >
                        <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] uppercase text-muted">
                          {c.type}
                        </span>
                        <span className="truncate font-mono text-xs">{shortUrl(c.url)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-muted">
                No image or video was found on it. Paste the file&apos;s own link instead: right-click the image or
                video and choose &quot;Copy image address&quot; or &quot;Copy video address&quot;.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
