"use client";

// Detects Adobe TrustMark invisible watermarks (variant Q), on the device.
//
// TrustMark is the watermark C2PA recommends alongside Content Credentials
// ("durable Content Credentials"): it survives screenshots, resizing and
// re-compression, so it can show that an image once carried a label that has
// since been stripped. Pipeline from Adobe's reference decoder
// (https://github.com/adobe/trustmark, MIT): resize to 256×256 with an
// antialiasing model, run the decoder, error-correct the 100 bits read.

import type { InferenceSession, Tensor } from "onnxruntime-web";
import models from "./models.json";
import { decodePayload } from "./payload";

type Ort = typeof import("onnxruntime-web/wasm");

/** Where the models are loaded from. Adobe's server by default; "/trustmark/" to self-host. */
const MODEL_BASE = process.env.NEXT_PUBLIC_TRUSTMARK_MODEL_BASE || models.source;
const MODEL_CACHE = "cc-models"; // kept by public/sw.js across updates
const RESOLUTION = 256;
/** Longest side the image is reduced to before the antialiasing resize. */
const WORKING_SIZE = 1024;
/**
 * Below this, the watermark can't be read reliably: in testing, a 120 px copy
 * still decoded but heavily compressed ~150 px copies didn't.
 */
export const MIN_SIDE = 128;
/**
 * Average |logit| a genuine watermark produces. Error correction alone lets
 * some unwatermarked images through (weak schemas accept ~7% of random bits);
 * real watermarks measured 7.5–9.7, clean images 0.05–0.7.
 */
const MIN_CONFIDENCE = 3;

export const DOWNLOAD_BYTES = Object.values(models.files).reduce((sum, f) => sum + f.bytes, 0);

export type WatermarkResult =
  | {
      status: "found";
      schema: string;
      /** C2PA soft-binding reference that identifies the original credentials. */
      softBinding: { alg: string; value: string };
      confidence: number;
    }
  | { status: "none"; confidence: number }
  | { status: "too-small" }
  | { status: "unsupported" };

type Progress = (loaded: number, total: number) => void;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function modelUrl(file: string): string {
  return new URL(MODEL_BASE + file, window.location.href).href;
}

/** Whether the models are already saved on this device (so no download is needed). */
export async function modelsDownloaded(): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(MODEL_CACHE);
    for (const file of Object.keys(models.files)) if (!(await cache.match(modelUrl(file)))) return false;
    return true;
  } catch {
    return false;
  }
}

/** Downloads (or reads from cache) one model file and verifies its checksum. */
async function loadModel(file: keyof typeof models.files, onProgress: Progress, done: number): Promise<Uint8Array> {
  const url = modelUrl(file);
  const expected = models.files[file];
  const cache = "caches" in window ? await caches.open(MODEL_CACHE).catch(() => null) : null;

  const cached = await cache?.match(url);
  if (cached) {
    const buf = await cached.arrayBuffer();
    if ((await sha256Hex(buf)) === expected.sha256) {
      onProgress(done + expected.bytes, DOWNLOAD_BYTES);
      return new Uint8Array(buf);
    }
    await cache?.delete(url);
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn't download the watermark detector (HTTP ${res.status}).`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    chunks.push(value);
    received += value.length;
    onProgress(done + received, DOWNLOAD_BYTES);
  }
  const buf = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  if ((await sha256Hex(buf.buffer)) !== expected.sha256) {
    throw new Error("The downloaded watermark detector didn't match its expected checksum, so it wasn't used.");
  }
  await cache?.put(url, new Response(buf, { headers: { "content-type": "application/octet-stream" } })).catch(() => {});
  return buf;
}

interface Sessions {
  ort: Ort;
  resizer: InferenceSession;
  decoder: InferenceSession;
}

let sessions: Promise<Sessions> | null = null;

function loadSessions(onProgress: Progress): Promise<Sessions> {
  sessions ??= (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = `/ort/${ort.env.versions.web}/`;
    // Multi-threading needs cross-origin isolation, which this site doesn't enable.
    ort.env.wasm.numThreads = 1;
    const resizerBytes = await loadModel("resizer.onnx", onProgress, 0);
    const decoderBytes = await loadModel("decoder_Q.onnx", onProgress, models.files["resizer.onnx"].bytes);
    const options = { executionProviders: ["wasm"] };
    return {
      ort,
      resizer: await ort.InferenceSession.create(resizerBytes, options),
      decoder: await ort.InferenceSession.create(decoderBytes, options),
    };
  })().catch((err) => {
    sessions = null;
    throw err;
  });
  return sessions;
}

/** Reads the image as a float CHW tensor, shrunk so the longest side is at most WORKING_SIZE. */
async function imageTensor(ort: Ort, file: File): Promise<Tensor | "too-small" | "unsupported"> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return "unsupported"; // e.g. HEIC in browsers that can't decode it
  }
  if (Math.min(bitmap.width, bitmap.height) < MIN_SIDE) {
    bitmap.close();
    return "too-small";
  }
  const scale = Math.min(1, WORKING_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);

  const page = width * height;
  const out = new Float32Array(page * 3);
  for (let i = 0; i < page; i++) {
    out[i] = data[i * 4] / 255;
    out[i + page] = data[i * 4 + 1] / 255;
    out[i + 2 * page] = data[i * 4 + 2] / 255;
  }
  return new ort.Tensor("float32", out, [1, 3, height, width]);
}

/** Scale factors the resize model needs to produce exactly `target` pixels (from Adobe's decoder). */
function scaleFor(original: number, target: number): number {
  let min = target / original;
  let max = (target + 1) / original;
  let scale = min;
  for (let i = 0; i < 100; i++) {
    scale = (min + max) / 2;
    const size = Math.floor(original * scale + 1e-12);
    if (size < target) min = scale;
    else if (size > target) max = scale;
    else break;
  }
  return scale;
}

/** Centre-crops very wide or tall images to a square, as the Q variant expects. */
function cropForDecoder(ort: Ort, input: Tensor): Tensor {
  const [, channels, height, width] = input.dims as number[];
  const aspect = width / height;
  let cropW = width;
  let cropH = height;
  let x0 = 0;
  let y0 = 0;
  if (aspect > 2) {
    cropW = height;
    x0 = Math.floor((width - cropW) / 2);
  } else if (aspect < 0.5) {
    cropH = width;
    y0 = Math.floor((height - cropH) / 2);
  } else {
    return input;
  }
  const src = input.data as Float32Array;
  const out = new Float32Array(channels * cropW * cropH);
  let k = 0;
  for (let c = 0; c < channels; c++)
    for (let y = 0; y < cropH; y++)
      for (let x = 0; x < cropW; x++) out[k++] = src[c * width * height + (y + y0) * width + (x + x0)];
  return new ort.Tensor("float32", out, [1, channels, cropH, cropW]);
}

export async function detectWatermark(file: File, onProgress: Progress = () => {}): Promise<WatermarkResult> {
  const { ort, resizer, decoder } = await loadSessions(onProgress);
  const image = await imageTensor(ort, file);
  if (image === "too-small" || image === "unsupported") return { status: image };

  const cropped = cropForDecoder(ort, image);
  const [, , h, w] = cropped.dims as number[];
  const resized = await resizer.run({
    X: cropped,
    scales: new ort.Tensor("float32", new Float32Array([1, 1, scaleFor(h, RESOLUTION), scaleFor(w, RESOLUTION)]), [4]),
    target_size: new ort.Tensor("int64", new BigInt64Array([BigInt(RESOLUTION)]), [1]),
  });
  const output = await decoder.run({ image: resized.Y });
  const logits = Array.from(output.output.data as Float32Array);

  const confidence = logits.reduce((sum, v) => sum + Math.abs(v), 0) / logits.length;
  const payload = decodePayload(logits.map((v) => v >= 0));
  if (!payload.valid || confidence < MIN_CONFIDENCE) return { status: "none", confidence };
  return {
    status: "found",
    schema: payload.schema,
    softBinding: { alg: `com.adobe.trustmark.${models.variant}`, value: `${payload.version}*${payload.bits}` },
    confidence,
  };
}
