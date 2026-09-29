# TrustMark fixtures

Sample images from Adobe's TrustMark repository
([adobe/trustmark](https://github.com/adobe/trustmark/tree/main/images), MIT):

| File | What it exercises |
| --- | --- |
| `ufo_240_Q.png`, `ghost_Q.png` | Images watermarked with TrustMark variant Q |
| `ghost.png` | The unwatermarked original. It carries real Adobe Photoshop Content Credentials declaring generative AI, so it also tests the red AI flag on a genuine label |
| `screenshot_1x_ghost_Q.png` | A browser screenshot of `ghost_Q.png` shown on a page |

`bch-vectors.json` holds 200 error-correction cases generated with Adobe's Python
`bchecc.py` (random payloads with random bit flips, some beyond what can be corrected),
used to check the TypeScript port produces identical results.

The detector models themselves aren't committed: `npm run trustmark:models` downloads them
into `public/trustmark/` (checksums in `src/lib/trustmark/models.json`), which the test
server uses.
