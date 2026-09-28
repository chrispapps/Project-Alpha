"use client";

import type { C2pa, Reader } from "@contentauth/c2pa-web";
import { summarizeManifestStore, type ValidationOutcome } from "./credentials";

// Copied from the installed @contentauth/c2pa-web by scripts/copy-c2pa-wasm.mjs.
const WASM_SRC = "/c2pa/c2pa_bg.wasm";

interface Sdk {
  c2pa: C2pa;
  Reader: typeof Reader;
}

let instance: Promise<Sdk> | null = null;

/** Loads the SDK (and its Wasm binary) once, lazily, in the browser only. */
function getSdk(): Promise<Sdk> {
  instance ??= import("@contentauth/c2pa-web")
    .then(async ({ createC2pa, Reader }) => ({
      c2pa: await createC2pa({ wasmSrc: WASM_SRC }),
      Reader,
    }))
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

export async function validateFile(file: File): Promise<ValidationOutcome> {
  let sdk: Sdk;
  try {
    sdk = await getSdk();
  } catch (err) {
    return { status: "error", message: `Could not start the validator: ${errorMessage(err)}` };
  }

  let reader;
  try {
    reader = await sdk.Reader.fromBlob(sdk.c2pa, mimeTypeFor(file), file);
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
    const summary = summarizeManifestStore(await reader.manifestStore());
    return summary ? { status: "credentials", summary } : { status: "none" };
  } catch (err) {
    return { status: "error", message: errorMessage(err) };
  } finally {
    await reader.free().catch(() => {});
  }
}
