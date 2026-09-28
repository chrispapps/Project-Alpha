"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportError(error, "render", error.digest);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted">
        The page hit an unexpected error and it&apos;s been reported. Your files weren&apos;t uploaded or saved.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/90"
      >
        Try again
      </button>
    </main>
  );
}
