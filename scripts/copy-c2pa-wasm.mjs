// Copies the C2PA Wasm binary from the installed @contentauth/c2pa-web package
// into public/ so Next.js serves it at /c2pa/c2pa_bg.wasm. Runs on install,
// dev and build so the binary always matches the installed SDK version.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = require.resolve("@contentauth/c2pa-web/resources/c2pa.wasm");
const target = join(root, "public", "c2pa", "c2pa_bg.wasm");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`c2pa: copied Wasm binary to ${target.slice(root.length + 1)}`);
