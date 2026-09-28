# Content Credentials Validator

Drop in an image and see its [C2PA](https://c2pa.org/) Content Credentials: who signed it, which
app or device produced it, what edits were recorded, and whether generative AI was declared.
Everything runs in the browser via WebAssembly, so files are never uploaded.

Built with Next.js (App Router), TypeScript, Tailwind CSS and
[`@contentauth/c2pa-web`](https://www.npmjs.com/package/@contentauth/c2pa-web), the official
browser SDK from the Content Authenticity Initiative (it replaces the deprecated `c2pa` package).

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Standard Next.js commands |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:e2e` | Builds the app and runs the Playwright tests in `tests/` against real C2PA sample images |

## How it works

- `src/lib/c2pa-client.ts` loads the SDK lazily, in the browser only, and reads a `File` with
  `Reader.fromBlob`. The SDK needs its Wasm binary served over HTTP; `scripts/copy-c2pa-wasm.mjs`
  copies it from `node_modules` to `public/c2pa/` on install, dev and build (the copy is gitignored,
  so it always matches the installed SDK version).
- `src/lib/credentials.ts` turns the raw manifest store into what the UI shows. It has no
  dependencies on the SDK runtime, so the rules are easy to follow:
  - **Author**: `stds.schema-org.CreativeWork` assertion (`author[].name`).
  - **Issuer / signed on / algorithm**: the active manifest's `signature_info`.
  - **Actions**: `c2pa.actions` / `c2pa.actions.v2` assertions.
  - **AI usage**: a `digitalSourceType` of `trainedAlgorithmicMedia`, `algorithmicMedia`,
    `compositeSynthetic` and the like, on an action or ingredient. This is what the signer
    *declared*, not an AI detector.
  - **Validation**: `validation_state` plus the active manifest's failure codes. An untrusted
    signing certificate is reported separately from tampering.
- `src/components/` holds the drop zone (`Validator.tsx`) and the results (`ResultPanel.tsx`), with
  states for valid, invalid/tampered, no credentials, and unreadable files.

## Known limits

- **Trust list**: the validator doesn't load a trust list yet, so a real signature from Adobe,
  a camera maker, etc. shows as "Content Credentials found" with an "issuer unconfirmed" note rather
  than "verified". Passing the C2PA trust anchors in a `Context` (`verify.verifyTrust`) enables the
  "trusted" state.
- Images whose credentials are stored remotely (a URL in XMP) need network access to that URL.
- Many platforms strip C2PA data on upload, so "No digital signature found" is common and doesn't
  mean an image is fake.
