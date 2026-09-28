import { expect, test } from "@playwright/test";

const APP_HEADER = { "x-ai-label-check": "1" };

test("the privacy page is linked from every page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "What happens to what you check" })).toBeVisible();
  await expect(page.getByText("files you upload never leave your device")).toBeVisible();
});

test("loads cookieless analytics from this site only", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('script[src="/_vercel/insights/script.js"]')).toHaveCount(1);
});

test.describe("error reports", () => {
  test("uncaught errors in the page are reported, without content", async ({ page }) => {
    await page.goto("/");
    const report = page.waitForRequest((req) => req.url().endsWith("/api/report-error") && req.method() === "POST");
    await page.evaluate(() => setTimeout(() => {
      throw new Error("test crash for reporting");
    }));
    const body = JSON.parse((await report).postData() ?? "{}");
    expect(body).toMatchObject({ message: "test crash for reporting", kind: "error", path: "/" });
    expect(Object.keys(body).sort()).toEqual(["kind", "message", "path", "stack"]);
  });

  test("the endpoint accepts app reports and rejects others", async ({ request }) => {
    const ok = await request.post("/api/report-error", { headers: APP_HEADER, data: { message: "boom", path: "/" } });
    expect(ok.status()).toBe(204);
    expect((await request.post("/api/report-error", { data: { message: "boom" } })).status()).toBe(403);
    expect((await request.post("/api/report-error", { headers: APP_HEADER, data: { path: "/" } })).status()).toBe(400);
    const huge = await request.post("/api/report-error", { headers: APP_HEADER, data: { message: "x".repeat(10_000) } });
    expect(huge.status()).toBe(413);
  });

  test("the endpoint is rate-limited per IP", async ({ request }) => {
    const headers = { ...APP_HEADER, "x-real-ip": "203.0.113.90" };
    for (let i = 0; i < 10; i++) {
      expect((await request.post("/api/report-error", { headers, data: { message: `m${i}` } })).status()).toBe(204);
    }
    expect((await request.post("/api/report-error", { headers, data: { message: "one too many" } })).status()).toBe(429);
  });
});
