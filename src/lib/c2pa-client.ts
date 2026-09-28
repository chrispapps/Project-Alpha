"use client";

import type { C2pa, Context, Reader } from "@contentauth/c2pa-web";
import { summarizeManifestStore, type ValidationOutcome } from "./credentials";

// Copied from the installed @contentauth/c2pa-web by scripts/copy-c2pa-wasm.mjs.
const WASM_SRC = "/c2pa/c2pa_bg.wasm";
// Official C2PA trust list, vendored by scripts/update-trust-list.mjs.
const TRUST_LIST_SRC = "/trust/C2PA-TRUST-LIST.pem";

/** Larger files are refused before reading, to keep the tab responsive. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

interface Sdk {
  c2pa: C2pa;
  Reader: typeof Reader;
  /** Context carrying the trust list, or undefined if it couldn't be loaded. */
  trust?: Context;
}

let instance: Promise<Sdk> | null = null;

/** Loads the SDK (and its Wasm binary) once, lazily, in the browser only. */
function getSdk(): Promise<Sdk> {
  instance ??= import("@contentauth/c2pa-web")
    .then(async ({ createC2pa, Context, Reader }) => {
      const c2pa = await createC2pa({ wasmSrc: WASM_SRC });
      // The SDK only fetches absolute http(s) URLs.
      const trust = new Context({
        trust: { trustAnchors: new URL(TRUST_LIST_SRC, window.location.origin).href },
      });
      try {
        // Resolve up front so a missing trust list degrades to "unverified"
        // instead of failing every read.
        await trust.toJson();
        return { c2pa, Reader, trust };
      } catch (err) {
        console.warn("C2PA trust list could not be loaded; issuers will show as unconfirmed.", err);
        return { c2pa, Reader };
      }
    })
    .catch((err) => {
      instance = null;
      throw err;
    });
  return instance;
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  dng: "image/x-adobe-dng",
};

export function mimeTypeFor(file: File): string | undefined {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? EXTENSION_TYPES[ext] : undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

// The SDK reports "nothing embedded" as an error on some formats.
const NO_MANIFEST = /jumbf ?not ?found|manifest ?not ?found|no ?manifest|provenance not found/i;

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export async function validateFile(file: File): Promise<ValidationOutcome> {
  if (file.size > MAX_FILE_BYTES) {
    return {
      status: "error",
      message: `This file is ${formatMb(file.size)}. The validator accepts files up to ${formatMb(MAX_FILE_BYTES)}.`,
    };
  }

  let sdk: Sdk;
  try {
    sdk = await getSdk();
  } catch (err) {
    return { status: "error", message: `Could not start the validator: ${errorMessage(err)}` };
  }

  let reader;
  try {
    reader = await sdk.Reader.fromBlob(sdk.c2pa, mimeTypeFor(file), file, sdk.trust);
  } catch (err) {
    const message = errorMessage(err);
    if (NO_MANIFEST.test(message)) return { status: "none" };
    if (/RemoteManifest/i.test(message)) {
      return {
        status: "error",
        message:
          "This image points to Content Credentials stored online, but they couldn't be downloaded. Check your connection or try again later.",
      };
    }
    if (/unsupported|format/i.test(message)) {
      return { status: "error", message: "This file format isn't supported for Content Credentials." };
    }
    return { status: "error", message };
  }
  if (!reader) return { status: "none" };

  try {
    const summary = summarizeManifestStore(await reader.manifestStore(), {
      trustListLoaded: !!sdk.trust,
    });
    return summary ? { status: "credentials", summary } : { status: "none" };
  } catch (err) {
    return { status: "error", message: errorMessage(err) };
  } finally {
    await reader.free().catch(() => {});
  }
}
