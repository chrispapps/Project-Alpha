"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/** Reports uncaught browser errors so crashes show up in the server logs. */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportError(event.error ?? event.message, "error");
    const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason, "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
