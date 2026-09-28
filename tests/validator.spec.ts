import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function upload(page: Page, name: string) {
  await page.goto("/");
  await expect(page.getByText("Drag & drop or upload an image")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(fixture(name));
}

test("shows manifest details for an image with valid credentials", async ({ page }) => {
  await upload(page, "CA.jpg");
  const result = page.getByTestId("result-credentials");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-trust", "valid");
  await expect(result.getByRole("heading", { name: "Content Credentials found" })).toBeVisible();
  await expect(result.getByText("John Doe")).toBeVisible();
  await expect(page.getByTestId("issuer")).toHaveText("C2PA Test Signing Cert");
  await expect(page.getByTestId("untrusted-signer")).toContainText("isn't on the official C2PA trust list");
  await expect(page.getByTestId("failures")).toHaveCount(0);
  await expect(page.getByTestId("actions").getByText("Opened", { exact: true })).toBeVisible();
  await expect(page.getByTestId("actions").getByText("Colour adjustments", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ai-usage")).toContainText("NONE DECLARED");
  // No AI declared: stays green, not flagged.
  await expect(result).not.toHaveAttribute("data-flag", "ai");
});

test("flags declared generative-AI use in red", async ({ page }) => {
  await upload(page, "C.jpg");
  const result = page.getByTestId("result-credentials");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-flag", "ai");
  await expect(result.getByRole("heading", { name: "Flagged: AI-generated image" })).toBeVisible();
  await expect(page.getByTestId("status")).toHaveClass(/border-danger/);
  await expect(page.getByTestId("ai-usage")).toContainText("AI GENERATED");
  await expect(page.getByTestId("ai-usage")).toContainText("algorithmicMedia");
});

for (const [name, code] of [
  ["E-sig-CA.jpg", "claimSignature.mismatch"],
  ["XCA.jpg", "assertion.dataHash.mismatch"],
] as const) {
  test(`reports failed validation for ${name}`, async ({ page }) => {
    await upload(page, name);
    const result = page.getByTestId("result-credentials");
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toHaveAttribute("data-trust", "invalid");
    await expect(result.getByRole("heading", { name: "Credentials failed validation" })).toBeVisible();
    await expect(page.getByTestId("failures")).toContainText(code);
  });
}

test("shows the empty state for an image without credentials", async ({ page }) => {
  await upload(page, "no_manifest.jpg");
  await expect(page.getByTestId("result-none")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "No digital signature found" })).toBeVisible();

  await page.getByRole("button", { name: "Check another image" }).click();
  await expect(page.getByText("Drag & drop or upload an image")).toBeVisible();
});

test("replaces the result when another file is chosen", async ({ page }) => {
  await upload(page, "no_manifest.jpg");
  await expect(page.getByTestId("result-none")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("file-input").setInputFiles(fixture("C.jpg"));
  await expect(page.getByTestId("result-credentials")).toBeVisible({ timeout: 30_000 });
});

test.describe("trust list", () => {
  // These tests swap the trust list via request interception, which can't see
  // requests the service worker answers from its cache.
  test.use({ serviceWorkers: "block" });

  test("marks credentials as verified when the signer chains to the trust list", async ({ page }) => {
    await page.route("**/trust/C2PA-TRUST-LIST.pem", (route) =>
      route.fulfill({ path: fixture("certs/test_cert_root_bundle.pem"), contentType: "application/x-pem-file" }),
    );
    await upload(page, "CA.jpg");
    const result = page.getByTestId("result-credentials");
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toHaveAttribute("data-trust", "trusted");
    await expect(result.getByRole("heading", { name: "Content Credentials verified" })).toBeVisible();
    await expect(page.getByTestId("untrusted-signer")).toHaveCount(0);
  });

  test("still validates when the trust list can't be loaded", async ({ page }) => {
    await page.route("**/trust/C2PA-TRUST-LIST.pem", (route) => route.fulfill({ status: 404, body: "" }));
    await upload(page, "CA.jpg");
    const result = page.getByTestId("result-credentials");
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toHaveAttribute("data-trust", "valid");
    await expect(page.getByTestId("untrusted-signer")).toContainText("couldn't be loaded");
  });

  test("a trusted AI-generated image is still flagged", async ({ page }) => {
    await page.route("**/trust/C2PA-TRUST-LIST.pem", (route) =>
      route.fulfill({ path: fixture("certs/test_cert_root_bundle.pem"), contentType: "application/x-pem-file" }),
    );
    await upload(page, "C.jpg");
    const result = page.getByTestId("result-credentials");
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toHaveAttribute("data-trust", "trusted");
    await expect(result).toHaveAttribute("data-flag", "ai");
    await expect(page.getByTestId("status")).toContainText("this label is authentic");
  });

  test("a tampered file stays invalid even when the signer is trusted", async ({ page }) => {
    await page.route("**/trust/C2PA-TRUST-LIST.pem", (route) =>
      route.fulfill({ path: fixture("certs/test_cert_root_bundle.pem"), contentType: "application/x-pem-file" }),
    );
    await upload(page, "XCA.jpg");
    const result = page.getByTestId("result-credentials");
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toHaveAttribute("data-trust", "invalid");
  });
});

test("sends security headers", async ({ request }) => {
  const res = await request.get("/");
  const csp = res.headers()["content-security-policy"];
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).toContain("worker-src 'self' blob:");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});
