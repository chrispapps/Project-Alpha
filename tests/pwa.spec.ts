import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

/** Loads the app and waits until the service worker controls the page. */
async function openControlledPage(page: Page) {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test("serves an installable web app manifest", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.share_target).toMatchObject({ action: "/share-target", method: "POST" });
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toContain("maskable");
  for (const icon of manifest.icons) {
    const iconRes = await request.get(icon.src);
    expect(iconRes.ok(), icon.src).toBe(true);
    expect(iconRes.headers()["content-type"]).toBe("image/png");
  }
});

test("serves the service worker uncached", async ({ request }) => {
  const res = await request.get("/sw.js");
  expect(res.ok()).toBe(true);
  expect(res.headers()["cache-control"]).toContain("no-cache");
});

test("checks images offline after the first visit", async ({ page, context }) => {
  await openControlledPage(page);
  // First check online loads the SDK, Wasm binary and trust list into the cache.
  await page.getByTestId("file-input").setInputFiles(fixture("CA.jpg"));
  await expect(page.getByTestId("result-credentials")).toBeVisible({ timeout: 30_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Drag & drop or upload an image")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(fixture("C.jpg"));
  await expect(page.getByTestId("result-credentials")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ai-usage")).toContainText("AI GENERATED");
  // The trust list came from the cache, not the "couldn't be loaded" fallback.
  await expect(page.getByTestId("untrusted-signer")).toContainText("official C2PA trust list");
});

test("checks an image shared from another app", async ({ page }) => {
  await openControlledPage(page);
  // Recreate what the OS share sheet sends: a multipart POST to the share target.
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.method = "post";
    form.enctype = "multipart/form-data";
    form.action = "/share-target";
    const input = document.createElement("input");
    input.type = "file";
    input.name = "image";
    input.id = "share-input";
    form.append(input);
    document.body.append(form);
  });
  await page.setInputFiles("#share-input", fixture("XCA.jpg"));
  await page.evaluate(() => (document.querySelector("#share-input")!.closest("form") as HTMLFormElement).submit());

  const result = page.getByTestId("result-credentials");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-trust", "invalid");
  await expect(page.getByText("XCA.jpg")).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});

test("explains when a share reaches the server instead of the app", async ({ page, request }) => {
  const res = await request.post("/share-target", { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toContain("/?shared=unavailable");

  await page.goto("/?shared=unavailable");
  await expect(page.getByTestId("notice")).toContainText("didn't come through");
});
