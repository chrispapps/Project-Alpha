import { expect, test } from "@playwright/test";
import { providerPageMessage, rewriteShareLink } from "../src/lib/server/share-links";

const rewrite = (url: string) => rewriteShareLink(new URL(url));

test.describe("Dropbox share links", () => {
  test("old-style file links download instead of previewing", () => {
    const result = rewrite("https://www.dropbox.com/s/abc123xyz/clip.mp4?dl=0");
    expect(result).toMatchObject({ kind: "file", provider: "Dropbox" });
    expect(result.kind === "file" && result.url.href).toBe("https://www.dropbox.com/s/abc123xyz/clip.mp4?dl=1");
  });

  test("new-style links keep their access key", () => {
    const result = rewrite("https://www.dropbox.com/scl/fi/k2x9q/photo.jpg?rlkey=r4nd0m&st=abc&dl=0");
    expect(result.kind === "file" && result.url.searchParams.get("rlkey")).toBe("r4nd0m");
    expect(result.kind === "file" && result.url.searchParams.get("dl")).toBe("1");
  });

  test("links without the www prefix and raw=1 links work too", () => {
    const result = rewrite("https://dropbox.com/s/abc123xyz/song.mp3?raw=1");
    expect(result.kind === "file" && result.url.searchParams.get("dl")).toBe("1");
    expect(result.kind === "file" && result.url.searchParams.has("raw")).toBe(false);
  });

  test("folder links are recognised", () => {
    expect(rewrite("https://www.dropbox.com/sh/abc/xyz?dl=0")).toEqual({ kind: "folder", provider: "Dropbox" });
    expect(rewrite("https://www.dropbox.com/scl/fo/abc/xyz?rlkey=1")).toEqual({ kind: "folder", provider: "Dropbox" });
  });

  test("other Dropbox pages are left alone", () => {
    expect(rewrite("https://www.dropbox.com/home")).toEqual({ kind: "none" });
  });
});

test.describe("Google Drive share links", () => {
  const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const direct = `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`;

  for (const link of [
    `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
    `https://drive.google.com/file/d/${ID}/view?usp=drive_link`,
    `https://drive.google.com/file/d/${ID}/preview`,
    `https://drive.google.com/file/u/0/d/${ID}/view`,
    `https://drive.google.com/open?id=${ID}`,
    `https://drive.google.com/uc?id=${ID}&export=download`,
  ]) {
    test(`converts ${new URL(link).pathname}${new URL(link).search.slice(0, 12)}`, () => {
      const result = rewrite(link);
      expect(result).toMatchObject({ kind: "file", provider: "Google Drive" });
      expect(result.kind === "file" && result.url.href).toBe(direct);
    });
  }

  test("folder links are recognised", () => {
    expect(rewrite("https://drive.google.com/drive/folders/1xyz")).toEqual({ kind: "folder", provider: "Google Drive" });
    expect(rewrite("https://drive.google.com/drive/u/0/folders/1xyz")).toEqual({ kind: "folder", provider: "Google Drive" });
  });

  test("links without a valid file ID are left alone", () => {
    expect(rewrite("https://drive.google.com/drive/my-drive")).toEqual({ kind: "none" });
    expect(rewrite("https://drive.google.com/open?id=%3Cscript%3E")).toEqual({ kind: "none" });
  });
});

test("other hosts are untouched", () => {
  expect(rewrite("https://example.com/s/abc/clip.mp4")).toEqual({ kind: "none" });
  expect(rewrite("https://notdropbox.com/s/abc/clip.mp4")).toEqual({ kind: "none" });
});

test("explains when Drive or Dropbox return a page instead of the file", () => {
  expect(providerPageMessage(new URL("https://drive.usercontent.google.com/download?id=x"))).toContain("Anyone with the link");
  expect(providerPageMessage(new URL("https://accounts.google.com/signin"))).toContain("Anyone with the link");
  expect(providerPageMessage(new URL("https://www.dropbox.com/s/x/y"))).toContain("Dropbox showed a page");
  expect(providerPageMessage(new URL("https://example.com/"))).toBeUndefined();
});
