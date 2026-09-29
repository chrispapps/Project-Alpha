"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MAX_FILE_BYTES, takeSharedFile, validateFile } from "@/lib/c2pa-client";
import type { ValidationOutcome } from "@/lib/credentials";
import { ACCEPT, extensionType, mediaKind, type MediaKind } from "@/lib/media";
import LinkChecker from "./LinkChecker";
import ResultPanel from "./ResultPanel";

type Checked = { file: File; previewUrl: string; kind: MediaKind; sourceUrl?: string };

type State =
  | { phase: "idle" }
  | ({ phase: "reading" } & Checked)
  | ({ phase: "done"; outcome: ValidationOutcome } & Checked);

function MediaPreview({ kind, url, name }: { kind: MediaKind; url: string; name: string }) {
  if (kind === "video") {
    return (
      <video
        src={url}
        controls
        muted
        playsInline
        preload="metadata"
        aria-label={`Preview of ${name}`}
        data-testid="preview-video"
        className="max-h-[420px] w-full rounded-xl bg-black object-contain"
      />
    );
  }
  if (kind === "audio") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl bg-surface-2 px-4 py-10" data-testid="preview-audio">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden>
          <path d="M9 18V5l11-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        </svg>
        <audio src={url} controls preload="metadata" aria-label={`Preview of ${name}`} className="w-full" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
    <img src={url} alt={`Preview of ${name}`} className="max-h-[420px] w-full rounded-xl bg-surface-2 object-contain" />
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

export default function Validator() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const inputId = useId();

  const previewUrl = state.phase === "idle" ? null : state.previewUrl;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFile = useCallback(async (file: File, sourceUrl?: string) => {
    setNotice(null);
    const id = ++runId.current;
    const checked: Checked = {
      file,
      previewUrl: URL.createObjectURL(file),
      kind: mediaKind(file.type || extensionType(file.name)),
      sourceUrl,
    };
    setState({ phase: "reading", ...checked });
    const outcome = await validateFile(file);
    if (id !== runId.current) return; // a newer file replaced this one
    setState({ phase: "done", outcome, ...checked });
  }, []);

  // An image shared from another app arrives via the service worker as /?shared=…
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get("shared");
    if (!shared) return;
    window.history.replaceState(null, "", "/");
    const failed = "The shared file didn't come through. Open the app once, then try sharing again.";
    (shared === "1" ? takeSharedFile() : Promise.resolve(null))
      .then((file) => (file ? handleFile(file) : setNotice(failed)))
      .catch(() => setNotice(failed));
  }, [handleFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const reset = () => {
    runId.current++;
    setState({ phase: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      data-testid="file-input"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void handleFile(file);
      }}
    />
  );

  if (state.phase === "idle") {
    return (
      <div className="flex flex-col gap-4">
        {notice && (
          <p role="status" className="rounded-xl border border-warn/40 bg-warn/[0.06] px-4 py-3 text-sm" data-testid="notice">
            {notice}
          </p>
        )}
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`group relative flex min-h-[340px] cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border border-dashed p-10 text-center transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-accent ${
            dragging
              ? "border-accent bg-accent/[0.06]"
              : "border-border bg-surface/80 hover:border-muted/60 hover:bg-surface"
          }`}
        >
          {input}
          <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface-2 text-accent transition-transform group-hover:-translate-y-0.5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 15V4" />
              <path d="M7.5 8.5L12 4l4.5 4.5" />
              <path d="M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15" />
            </svg>
          </span>
          <span className="flex flex-col gap-1.5">
            <span className="text-lg font-medium">
              {dragging ? "Release to check this file" : "Drag & drop or upload an image, video or audio file"}
            </span>
            <span className="text-sm text-muted">
              Photos (JPEG, PNG, HEIC…), video (MP4, MOV) and audio (MP3, WAV, M4A) · up to {formatBytes(MAX_FILE_BYTES)}
            </span>
          </span>
          <span className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background">
            Choose file
          </span>
        </label>
        <LinkChecker onFile={(file, sourceUrl) => void handleFile(file, sourceUrl)} />
      </div>
    );
  }

  const { file } = state;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col gap-4 self-start rounded-2xl border border-border bg-surface p-4">
        <MediaPreview kind={state.kind} url={state.previewUrl} name={file.name} />
        <div className="flex items-center justify-between gap-4 px-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
            <p className="font-mono text-xs text-muted">
              {file.type || "unknown type"} · {formatBytes(file.size)}
            </p>
            {state.sourceUrl && (
              <p className="truncate font-mono text-xs text-muted" title={state.sourceUrl} data-testid="source-url">
                from {state.sourceUrl}
              </p>
            )}
          </div>
          <label
            htmlFor={inputId}
            className="shrink-0 cursor-pointer rounded-full border border-border px-4 py-2 text-sm hover:bg-surface-2 focus-within:outline focus-within:outline-2 focus-within:outline-accent"
          >
            {input}
            Check another
          </label>
        </div>
      </section>

      <section aria-live="polite" className="min-w-0">
        {state.phase === "reading" ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center" data-testid="result-reading">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden />
            <p className="text-sm text-muted">
              Reading Content Credentials{state.kind === "image" ? "" : ` (large ${state.kind === "video" ? "videos" : "files"} can take a moment)`}…
            </p>
          </div>
        ) : (
          <ResultPanel outcome={state.outcome} kind={state.kind} file={state.file} onReset={reset} />
        )}
      </section>
    </div>
  );
}
