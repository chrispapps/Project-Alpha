// Downloads the official C2PA trust list (the certificate authorities admitted
// through the C2PA conformance program) into public/trust/. The file is
// committed so deployments are reproducible and changes show up in review.
// Run with: npm run trust:update
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE =
  "https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.pem";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "trust", "C2PA-TRUST-LIST.pem");

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Failed to download trust list: HTTP ${res.status}`);
const pem = await res.text();
const count = (pem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length;
if (count === 0) throw new Error("Downloaded trust list contains no certificates");

let previous = "";
try {
  previous = readFileSync(target, "utf8");
} catch {}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, pem);
console.log(
  `trust list: ${count} certificates${previous === pem ? " (unchanged)" : " (updated)"} -> ${target.slice(root.length + 1)}`,
);
