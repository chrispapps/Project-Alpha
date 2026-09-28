import { fetchMedia } from "@/lib/server/fetch-media";

// Downloading a large video can take a while.
export const maxDuration = 60;

// Must match the header the app sends (src/lib/link-client.ts). Browsers
// won't send a custom header cross-site without a CORS preflight, which this
// route never approves, so other websites can't use it as a download proxy.
const APP_HEADER = "x-ai-label-check";

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  if (request.headers.get(APP_HEADER) !== "1") {
    return json({ kind: "error", code: "forbidden", message: "Not allowed." }, 403);
  }
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return json({ kind: "error", code: "invalid-url", message: "Paste a link to check." }, 400);

  const result = await fetchMedia(target);
  if (result.kind === "page") return json(result, 200);
  if (result.kind === "error") {
    const status = result.code === "blocked" ? 403 : result.code === "too-large" ? 413 : result.code === "social" ? 422 : 400;
    return json(result, status);
  }

  const headers = new Headers({
    "content-type": result.contentType,
    // Never let fetched content render as a page on this site (e.g. an SVG with scripts).
    "content-disposition": `attachment; filename="${result.fileName}"`,
    "content-security-policy": "default-src 'none'; sandbox",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "x-file-name": encodeURIComponent(result.fileName),
    "x-source-url": encodeURIComponent(result.finalUrl),
  });
  if (result.length) headers.set("content-length", String(result.length));
  return new Response(result.body, { status: 200, headers });
}
