import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BCH } from "../src/lib/trustmark/bch";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

test("the BCH port matches Adobe's Python reference exactly", () => {
  const vectors = JSON.parse(readFileSync(fixture("trustmark/bch-vectors.json"), "utf8")) as {
    t: number;
    data: number[];
    ecc: number[];
    py_result: number;
    py_data: number[];
  }[];
  const decoders = new Map<number, BCH>();
  for (const v of vectors) {
    const bch = decoders.get(v.t) ?? new BCH(v.t, 137);
    decoders.set(v.t, bch);
    const data = [...v.data];
    const result = bch.decode(data, [...v.ecc]);
    expect(result).toBe(v.py_result);
    if (result >= 0) expect(data).toEqual(v.py_data);
  }
});

async function checkImage(page: Page, name: string) {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(fixture(name));
  await expect(page.getByTestId("result-none")).toBeVisible({ timeout: 30_000 });
  return page.getByTestId("watermark");
}

test.describe("invisible watermark check", () => {
  test("finds a TrustMark watermark after the user opts in", async ({ page }) => {
    const card = await checkImage(page, "trustmark/ufo_240_Q.png");
    await expect(card).toHaveAttribute("data-status", "idle");
    await expect(card).toContainText("one-time 45 MB download");
    await card.getByRole("button", { name: "Check for a watermark" }).click();
    await expect(card).toHaveAttribute("data-status", "found", { timeout: 60_000 });
    await expect(card).toContainText("this image had Content Credentials");
    await expect(page.getByTestId("watermark-id")).toContainText("com.adobe.trustmark.Q · 1*");
  });

  test("still finds the watermark in a screenshot", async ({ page }) => {
    const card = await checkImage(page, "trustmark/screenshot_1x_ghost_Q.png");
    await card.getByRole("button", { name: "Check for a watermark" }).click();
    await expect(card).toHaveAttribute("data-status", "found", { timeout: 60_000 });
  });

  test("reports no watermark on a clean image", async ({ page }) => {
    const card = await checkImage(page, "no_manifest.jpg");
    await card.getByRole("button", { name: "Check for a watermark" }).click();
    await expect(card).toHaveAttribute("data-status", "none", { timeout: 60_000 });
    await expect(card).toContainText("No invisible watermark found");
  });

  test("isn't offered when the image already has Content Credentials", async ({ page }) => {
    // Adobe's sample carries real Photoshop credentials declaring generative AI.
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles(fixture("trustmark/ghost.png"));
    const result = page.getByTestId("result-credentials");
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toHaveAttribute("data-flag", "ai");
    await expect(page.getByTestId("issuer")).toHaveText("Adobe Inc.");
    await expect(page.getByTestId("watermark")).toHaveCount(0);
  });

  test("runs automatically once the detector is on the device", async ({ page }) => {
    const first = await checkImage(page, "trustmark/ghost_Q.png");
    await first.getByRole("button", { name: "Check for a watermark" }).click();
    await expect(first).toHaveAttribute("data-status", "found", { timeout: 60_000 });

    // A second image: no button press needed now the models are cached.
    await page.getByRole("button", { name: "Check another image" }).click();
    await page.getByTestId("file-input").setInputFiles(fixture("origin/IMG_1234.jpg"));
    const second = page.getByTestId("watermark");
    await expect(second).toHaveAttribute("data-status", "none", { timeout: 60_000 });
  });

  test("isn't offered for video or audio", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles(fixture("media/video1_no_manifest.mp4"));
    await expect(page.getByTestId("result-none")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("watermark")).toHaveCount(0);
  });
});
