// Copies the ONNX Runtime WebAssembly files used by the TrustMark watermark
// check into public/ort/<version>/, so the browser loads them from this site.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "onnxruntime-web", "dist");
const { version } = JSON.parse(readFileSync(join(root, "node_modules", "onnxruntime-web", "package.json"), "utf8"));
const target = join(root, "public", "ort", version);

mkdirSync(target, { recursive: true });
for (const file of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  copyFileSync(join(dist, file), join(target, file));
}
console.log(`ort: copied WebAssembly runtime ${version} to public/ort/${version}/`);
