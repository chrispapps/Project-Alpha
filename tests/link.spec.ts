import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { FIXTURE_ORIGIN } from "../playwright.config";

const APP_HEADER = { "x-ai-label-check": "1" };

/** Calls the link fetcher the way the app does: a POST with the link in the body. */
function fetchMedia(request: APIRequestContext, url: string, headers: Record<string, string> = APP_HEADER) {
  return request.post("/api/fetch-media", { headers, data: { url } });
}

async function checkLink(page: Page, url: string) {
  await page.goto("/");
  await page.getByTestId("link-input").fill(url);
  await page.getByRole("button", { name: "Check link" }).click();
}

test("checks an image from a link", async ({ page }) => {
  await checkLink(page, `${FIXTURE_ORIGIN}/C.jpg`);
  const result = page.getByTestId("result-credentials");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-flag", "ai");
  await expect(page.getByTestId("source-url")).toContainText(`${FIXTURE_ORIGIN}/C.jpg`);
});

test("checks a video from a link", async ({ page }) => {
  await checkLink(page, `${FIXTURE_ORIGIN}/media/video1.mp4`);
  await expect(page.getByTestId("result-credentials")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("preview-video")).toBeVisible();
});

test("follows redirects and recognises files served with a generic type", async ({ page }) => {
  await checkLink(page, `${FIXTURE_ORIGIN}/redirect`);
  await expect(page.getByTestId("result-credentials")).toBeVisible({ timeout: 30_000 });

  await checkLink(page, `${FIXTURE_ORIGIN}/download`);
  await expect(page.getByTestId("result-credentials")).toBeVisible({ timeout: 30_000 });
});

test("offers the image and video featured on a web page", async ({ page }) => {
  await checkLink(page, `${FIXTURE_ORIGIN}/page.html`);
  const found = page.getByTestId("link-page");
  await expect(found).toBeVisible({ timeout: 30_000 });
  await expect(found.getByRole("button")).toHaveCount(2);
  await found.getByRole("button", { name: /video/ }).click();
  await expect(page.getByTestId("result-credentials")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("preview-video")).toBeVisible();
});

test("explains when a web page has nothing to check", async ({ page }) => {
  await checkLink(page, `${FIXTURE_ORIGIN}/empty-page.html`);
  await expect(page.getByTestId("link-page")).toContainText("No image or video was found");
});

test("points social posts to the platform's own AI label", async ({ page }) => {
  await checkLink(page, "https://www.instagram.com/reel/C0ffee123/");
  const error = page.getByTestId("link-error");
  await expect(error).toHaveAttribute("data-code", "social");
  await expect(error).toContainText("Instagram posts can't be checked here");
  await expect(error).toContainText("Instagram's own AI label");
});

test("refuses links that aren't media", async ({ page }) => {
  await checkLink(page, `${FIXTURE_ORIGIN}/notes.txt`);
  await expect(page.getByTestId("link-error")).toHaveAttribute("data-code", "not-media");
});

test.describe("link fetcher security", () => {
  for (const target of [
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/photo.jpg",
    "http://127.0.0.1:3100/",
    "http://localhost/photo.jpg",
    "http://[::1]/photo.jpg",
    "https://example.com:8443/photo.jpg",
  ]) {
    test(`blocks ${target}`, async ({ request }) => {
      const res = await fetchMedia(request, target);
      expect(res.status()).toBe(403);
      expect((await res.json()).code).toBe("blocked");
    });
  }

  test("blocks a redirect into a private address", async ({ request }) => {
    const url = `${FIXTURE_ORIGIN}/to-private`;
    const res = await fetchMedia(request, url);
    expect(res.status()).toBe(403);
  });

  test("rejects requests that don't come from the app", async ({ request }) => {
    const res = await fetchMedia(request, `${FIXTURE_ORIGIN}/C.jpg`, {});
    expect(res.status()).toBe(403);
  });

  test("serves fetched files as downloads that can't run on this site", async ({ request }) => {
    const url = `${FIXTURE_ORIGIN}/drawing.svg`;
    const res = await fetchMedia(request, url);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/^attachment/);
    expect(res.headers()["content-security-policy"]).toContain("sandbox");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });
});

test("explains that folder links can't be checked", async ({ page }) => {
  await checkLink(page, "https://www.dropbox.com/sh/abc123/xyz?dl=0");
  const error = page.getByTestId("link-error");
  await expect(error).toHaveAttribute("data-code", "folder");
  await expect(error).toContainText("Dropbox folder");
});

test.describe("link fetcher limits", () => {
  test("only accepts POST, so links stay out of request logs", async ({ request }) => {
    const res = await request.get(`/api/fetch-media?url=${encodeURIComponent(`${FIXTURE_ORIGIN}/C.jpg`)}`, { headers: APP_HEADER });
    expect(res.status()).toBe(405);
  });

  test("rate-limits a single IP address", async ({ request }) => {
    // A documentation address, so no other test shares this caller's count.
    const headers = { ...APP_HEADER, "x-real-ip": "203.0.113.77" };
    for (let i = 0; i < 20; i++) {
      expect((await fetchMedia(request, "not a link", headers)).status()).toBe(400);
    }
    const limited = await fetchMedia(request, "not a link", headers);
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
    expect((await limited.json()).code).toBe("rate-limited");

    // Other callers are unaffected.
    const other = await fetchMedia(request, "not a link", { ...APP_HEADER, "x-real-ip": "203.0.113.78" });
    expect(other.status()).toBe(400);
  });
});
