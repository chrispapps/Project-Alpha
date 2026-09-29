"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WatermarkResult } from "@/lib/trustmark/detect";

type State =
  | { phase: "idle"; downloaded: boolean | null }
  | { phase: "running"; loaded: number; total: number }
  | { phase: "done"; result: WatermarkResult }
  | { phase: "error"; message: string };

const MB = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

function WatermarkIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M12 3c3 3.8 6 7.3 6 10.5a6 6 0 01-12 0C6 10.3 9 6.8 12 3z" />
      <path d="M9.5 14.5a2.6 2.6 0 002.5 2.3" />
    </svg>
  );
}

/**
 * Looks for an Adobe TrustMark invisible watermark in an image that has no
 * Content Credentials. The detector (a one-time download) runs on the device.
 */
export default function WatermarkCheck({ file }: { file: File }) {
  const [state, setState] = useState<State>({ phase: "idle", downloaded: null });
  const [downloadBytes, setDownloadBytes] = useState<number | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setState({ phase: "running", loaded: 0, total: 0 });
    try {
      const { detectWatermark } = await import("@/lib/trustmark/detect");
      const result = await detectWatermark(file, (loaded, total) => setState({ phase: "running", loaded, total }));
      setState({ phase: "done", result });
    } catch (err) {
      started.current = false;
      setState({ phase: "error", message: err instanceof Error ? err.message : "The watermark check failed." });
    }
  }, [file]);

  // Run straight away if the detector is already saved on this device.
  useEffect(() => {
    let cancelled = false;
    import("@/lib/trustmark/detect").then(async ({ modelsDownloaded, DOWNLOAD_BYTES }) => {
      const downloaded = await modelsDownloaded();
      if (cancelled) return;
      setDownloadBytes(DOWNLOAD_BYTES);
      if (downloaded) void run();
      else setState({ phase: "idle", downloaded: false });
    });
    return () => {
      cancelled = true;
    };
  }, [run]);

  if (state.phase === "done" && state.result.status === "found") {
    const { softBinding } = state.result;
    return (
      <div className="rounded-2xl border border-warn/40 bg-warn/[0.06] p-5" data-testid="watermark" data-status="found">
        <div className="flex items-center gap-2.5">
          <WatermarkIcon className="text-warn" />
          <h3 className="text-base font-semibold">Invisible watermark found: this image had Content Credentials</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">
          It carries an Adobe TrustMark watermark, which is added when Content Credentials are created. The label has been
          removed from this copy (for example by a screenshot or re-upload), but the watermark survived.{" "}
          <strong>The watermark alone doesn&apos;t say who made it or whether AI was used</strong>; that was in the original
          credentials.
        </p>
        <dl className="mt-3 border-t border-warn/30 pt-3 text-xs">
          <dt className="text-muted">Watermark ID (C2PA soft binding)</dt>
          <dd className="mt-1 break-all font-mono text-foreground/85" data-testid="watermark-id">
            {softBinding.alg} · {softBinding.value}
          </dd>
        </dl>
        <p className="mt-3 text-xs text-muted">Looking up the original credentials from this ID isn&apos;t available yet.</p>
      </div>
    );
  }

  const shell = (children: React.ReactNode, status: string) => (
    <div className="rounded-2xl border border-border bg-surface p-5" data-testid="watermark" data-status={status}>
      <div className="flex items-start gap-2.5">
        <WatermarkIcon className="mt-0.5 text-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">{children}</div>
      </div>
    </div>
  );

  if (state.phase === "done") {
    const { status } = state.result;
    const message =
      status === "none"
        ? "No invisible watermark found. We checked for Adobe TrustMark; other watermarks, such as Google's SynthID, can't be checked by other apps yet."
        : status === "too-small"
          ? "This image is too small to check for an invisible watermark reliably."
          : "This image format can't be checked for an invisible watermark in this browser.";
    return shell(<p className="leading-relaxed text-muted">{message}</p>, status);
  }

  if (state.phase === "running") {
    const pct = state.total ? Math.min(100, Math.round((state.loaded / state.total) * 100)) : 0;
    const downloading = state.total > 0 && state.loaded < state.total;
    return shell(
      <>
        <p className="font-medium">{downloading ? "Downloading the watermark detector…" : "Checking for an invisible watermark…"}</p>
        {downloading && (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Download progress"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        )}
      </>,
      "running",
    );
  }

  if (state.phase === "error") {
    return shell(
      <>
        <p className="text-muted">{state.message}</p>
        <button type="button" onClick={() => void run()} className="self-start rounded-full border border-border px-4 py-2 text-sm hover:bg-surface-2">
          Try again
        </button>
      </>,
      "error",
    );
  }

  if (state.downloaded === null) return null;

  return shell(
    <>
      <p className="font-medium">Check for an invisible watermark</p>
      <p className="leading-relaxed text-muted">
        Some tools add an invisible Adobe TrustMark watermark alongside Content Credentials. It survives screenshots and
        re-uploads, so it can show that a label was removed. The check runs on your device; the detector is a one-time
        {downloadBytes ? ` ${MB(downloadBytes)}` : ""} download.
      </p>
      <button
        type="button"
        onClick={() => void run()}
        className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90"
      >
        Check for a watermark
      </button>
    </>,
    "idle",
  );
}
