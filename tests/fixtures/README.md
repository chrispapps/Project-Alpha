# Test fixtures

Sample images from the C2PA reference SDK's test fixtures
([contentauth/c2pa-rs](https://github.com/contentauth/c2pa-rs/tree/main/sdk/tests/fixtures),
MIT / Apache-2.0). They are signed with the C2PA test certificate, which is not on any trust list.

| File | What it exercises |
| --- | --- |
| `CA.jpg` | Valid credentials: author, two actions, one ingredient |
| `C.jpg` | Valid credentials declaring `algorithmicMedia` (AI generated) |
| `E-sig-CA.jpg` | Corrupted claim signature (`claimSignature.mismatch`) |
| `XCA.jpg` | Image data changed after signing (`assertion.dataHash.mismatch`) |
| `no_manifest.jpg` | No Content Credentials at all |
