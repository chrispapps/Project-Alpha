import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function check(page: Page, name: string) {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(fixture(name));
}

test("warns that a tagged screenshot may have lost its AI label", async ({ page }) => {
  await check(page, "origin/IMG_4120.png");
  const result = page.getByTestId("result-none");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-origin", "screenshot");
  const note = page.getByTestId("origin-note");
  await expect(note).toHaveAttribute("data-certainty", "marked");
  await expect(note.getByRole("heading", { name: "This is a screenshot" })).toBeVisible();
  await expect(note).toContainText("doesn't mean the image isn't AI-generated");
  await expect(note).toContainText("metadata labels it a screenshot");
  await expect(note).toContainText("1179×2556");
});

test("recognises a screenshot by its file name", async ({ page }) => {
  await check(page, "origin/Screenshot_20260928-101500.png");
  const note = page.getByTestId("origin-note");
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toHaveAttribute("data-certainty", "marked");
  await expect(note).toContainText("file name looks like a screenshot");
});

test("says a screen-sized image without camera data only looks like a screenshot", async ({ page }) => {
  await check(page, "origin/capture.png");
  const note = page.getByTestId("origin-note");
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toHaveAttribute("data-certainty", "likely");
  await expect(note.getByRole("heading", { name: "This looks like a screenshot" })).toBeVisible();
});

test("doesn't flag a photo with camera information", async ({ page }) => {
  await check(page, "origin/IMG_1234.jpg");
  const result = page.getByTestId("result-none");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-origin", "camera");
  await expect(page.getByTestId("origin-note")).toHaveCount(0);
});

test("notes when an image has no camera information", async ({ page }) => {
  await check(page, "no_manifest.jpg");
  const result = page.getByTestId("result-none");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toHaveAttribute("data-origin", "no-camera-data");
  await expect(page.getByTestId("origin-note")).toContainText("No camera information either");
});

test("images with Content Credentials get no screenshot note", async ({ page }) => {
  await check(page, "C.jpg");
  await expect(page.getByTestId("result-credentials")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("origin-note")).toHaveCount(0);
});
