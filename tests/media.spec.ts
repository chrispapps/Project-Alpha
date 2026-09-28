import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function upload(page: Page, file: Parameters<Page["setInputFiles"]>[1]) {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(file);
}

test("reads Content Credentials in a video", async ({ page }) => {
  await upload(page, fixture("media/video1.mp4"));
  const result = page.getByTestId("result-credentials");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-trust", "valid");
  await expect(page.getByTestId("preview-video")).toBeVisible();
});

test("detects a video altered after signing", async ({ page }) => {
  // Flip bytes near the end of the signed video, inside its media data.
  const bytes = readFileSync(fixture("media/video1.mp4"));
  for (let i = bytes.length - 5000; i < bytes.length - 4990; i++) bytes[i] ^= 0xff;
  await upload(page, { name: "video1-altered.mp4", mimeType: "video/mp4", buffer: bytes });
  const result = page.getByTestId("result-credentials");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-trust", "invalid");
});

test("says when a video has no credentials", async ({ page }) => {
  await upload(page, fixture("media/video1_no_manifest.mp4"));
  const result = page.getByTestId("result-none");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText("This video has no Content Credentials");
  // Screenshot clues are for still images only.
  await expect(page.getByTestId("origin-note")).toHaveCount(0);
});

test("checks audio files", async ({ page }) => {
  await upload(page, fixture("media/sample1.wav"));
  const result = page.getByTestId("result-none");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText("This audio file has no Content Credentials");
  await expect(page.getByTestId("preview-audio")).toBeVisible();
});
