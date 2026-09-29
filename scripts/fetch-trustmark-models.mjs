// Downloads the TrustMark watermark models into public/trustmark/ and checks
// their SHA-256 against src/lib/trustmark/models.json.
//
// Only needed to self-host the models (NEXT_PUBLIC_TRUSTMARK_MODEL_BASE=/trustmark/),
// which the test suite does. By default the app loads them from Adobe's server
// on demand, so deployments stay small and don't pay for 46 MB downloads.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "src", "lib", "trustmark", "models.json"), "utf8"));
const target = join(root, "public", "trustmark");
mkdirSync(target, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

for (const [file, { sha256: expected }] of Object.entries(config.files)) {
  const path = join(target, file);
  if (existsSync(path) && sha256(readFileSync(path)) === expected) {
    console.log(`trustmark: ${file} already present`);
    continue;
  }
  const res = await fetch(config.source + file);
  if (!res.ok) throw new Error(`Couldn't download ${file}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = sha256(buf);
  if (actual !== expected) throw new Error(`${file} checksum mismatch: expected ${expected}, got ${actual}`);
  writeFileSync(path, buf);
  console.log(`trustmark: downloaded ${file} (${(buf.length / 1048576).toFixed(1)} MB), checksum OK`);
}
