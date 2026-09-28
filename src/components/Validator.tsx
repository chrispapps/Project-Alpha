"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { validateFile } from "@/lib/c2pa-client";
import type { ValidationOutcome } from "@/lib/credentials";
import ResultPanel from "./ResultPanel";

type State =
  | { phase: "idle" }
  | { phase: "reading"; file: File; previewUrl: string }
  | { phase: "done"; file: File; previewUrl: string; outcome: ValidationOutcome };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Validator() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const inputId = useId();

  const previewUrl = state.phase === "idle" ? null : state.previewUrl;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFile = useCallback(async (file: File) => {
    const id = ++runId.current;
    const url = URL.createObjectURL(file);
    setState({ phase: "reading", file, previewUrl: url });
    const outcome = await validateFile(file);
    if (id !== runId.current) return; // a newer file replaced this one
    setState({ phase: "done", file, previewUrl: url, outcome });
  }, []);

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
      accept="image/*,.dng,.heic,.heif,.avif"
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
            {dragging ? "Release to check this image" : "Drag & drop or upload an image"}
          </span>
          <span className="text-sm text-muted">JPEG, PNG, WebP, AVIF, HEIC, TIFF, DNG, SVG and more</span>
        </span>
        <span className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background">
          Choose file
        </span>
      </label>
    );
  }

  const { file } = state;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col gap-4 self-start rounded-2xl border border-border bg-surface p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        <img
          src={state.previewUrl}
          alt={`Preview of ${file.name}`}
          className="max-h-[420px] w-full rounded-xl bg-surface-2 object-contain"
        />
        <div className="flex items-center justify-between gap-4 px-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
            <p className="font-mono text-xs text-muted">
              {file.type || "unknown type"} · {formatBytes(file.size)}
            </p>
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
            <p className="text-sm text-muted">Reading Content Credentials…</p>
          </div>
        ) : (
          <ResultPanel outcome={state.outcome} onReset={reset} />
        )}
      </section>
    </div>
  );
}
