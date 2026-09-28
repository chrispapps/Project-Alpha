// Fetches a media file from a URL on behalf of the browser, which usually
// can't download cross-site files itself. The bytes are streamed through to
// the browser (which checks them) and never stored.
//
// Because this makes requests from our server, it refuses anything that
// could reach private networks (SSRF): only http(s) on standard ports, and
// every connection, including each redirect hop, is checked against private
// and reserved address ranges at connect time, so DNS tricks can't slip past.

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { extensionType } from "@/lib/media";

export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;
const USER_AGENT = "AILabelCheck/1.0 (+Content Credentials checker)";

export type FetchError = {
  kind: "error";
  code: "invalid-url" | "blocked" | "social" | "http" | "not-media" | "too-large" | "timeout" | "network";
  message: string;
  platform?: string;
};

export type PageResult = {
  kind: "page";
  title?: string;
  candidates: { url: string; type: "image" | "video" }[];
};

export type MediaResult = {
  kind: "media";
  body: ReadableStream<Uint8Array>;
  contentType: string;
  fileName: string;
  length?: number;
  finalUrl: string;
};

export type FetchResult = MediaResult | PageResult | FetchError;

// Platforms that strip Content Credentials and serve pages, not files.
const SOCIAL_HOSTS: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/, "Facebook"],
  [/(^|\.)(x\.com|twitter\.com)$/, "X"],
  [/(^|\.)threads\.(net|com)$/, "Threads"],
  [/(^|\.)snapchat\.com$/, "Snapchat"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
];

const blocked = new net.BlockList();
for (const cidr of [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
  "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15",
  "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
]) {
  const [ip, bits] = cidr.split("/");
  blocked.addSubnet(ip, Number(bits), "ipv4");
}
for (const cidr of ["::/128", "::1/128", "fc00::/7", "fe80::/10", "ff00::/8", "64:ff9b::/96", "2001:db8::/32", "100::/64"]) {
  const [ip, bits] = cidr.split("/");
  blocked.addSubnet(ip, Number(bits), "ipv6");
}

/** host:port pairs allowed to be private; only for the test suite's fixture server. */
function allowedPrivateHosts(): Set<string> {
  return new Set((process.env.MEDIA_FETCH_ALLOW_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean));
}

export function isBlockedAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) return blocked.check(address, "ipv6");
  return true;
}

class BlockedError extends Error {}

function safeLookup(allowPrivate: boolean): net.LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { all: true, family: options.family }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = addresses as dns.LookupAddress[];
      if (!allowPrivate && (list.length === 0 || list.some((a) => isBlockedAddress(a.address)))) {
        return callback(new BlockedError(`Blocked address for ${hostname}`), "", 0);
      }
      if ((options as dns.LookupOptions).all) {
        return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
      }
      callback(null, list[0].address, list[0].family);
    });
  };
}

function error(code: FetchError["code"], message: string, extra: Partial<FetchError> = {}): FetchError {
  return { kind: "error", code, message, ...extra };
}

export function socialPlatform(url: URL): string | undefined {
  const host = url.hostname.toLowerCase();
  return SOCIAL_HOSTS.find(([pattern]) => pattern.test(host))?.[1];
}

/** Validates a URL before any request is made. */
function checkUrl(raw: string): URL | FetchError {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return error("invalid-url", "That doesn't look like a web address. It should start with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return error("invalid-url", "Only http and https links can be checked.");
  }
  if (url.username || url.password) return error("invalid-url", "Links with a username or password can't be checked.");
  const platform = socialPlatform(url);
  if (platform) {
    return error(
      "social",
      `${platform} doesn't let other apps download its posts, and it removes Content Credentials from uploads anyway. Look for ${platform}'s own AI label on the post instead.`,
      { platform },
    );
  }
  const allowPrivate = allowedPrivateHosts().has(url.host);
  const defaultPort = url.port === "" || url.port === (url.protocol === "https:" ? "443" : "80");
  if (!allowPrivate && !defaultPort) return error("blocked", "Links to non-standard ports can't be checked.");
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate && net.isIP(literal) && isBlockedAddress(literal)) {
    return error("blocked", "Links to private or local network addresses can't be checked.");
  }
  return url;
}

function request(url: URL): Promise<http.IncomingMessage> {
  const allowPrivate = allowedPrivateHosts().has(url.host);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(
      url,
      {
        lookup: safeLookup(allowPrivate),
        headers: { "user-agent": USER_AGENT, accept: "image/*,video/*,audio/*,text/html;q=0.8,*/*;q=0.5" },
        timeout: TIMEOUT_MS,
      },
      resolve,
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function readUpTo(res: http.IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res) {
    chunks.push(chunk as Buffer);
    total += (chunk as Buffer).length;
    if (total >= limit) break;
  }
  res.destroy();
  return Buffer.concat(chunks).subarray(0, limit);
}

/** Recognises media by its first bytes, for servers that send a generic type. */
export function sniffType(head: Uint8Array): string | undefined {
  const text = (start: number, end: number) => String.fromCharCode(...head.subarray(start, end));
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head[0] === 0x89 && text(1, 4) === "PNG") return "image/png";
  if (text(0, 4) === "GIF8") return "image/gif";
  if (text(0, 4) === "RIFF") {
    const kind = text(8, 12);
    return kind === "WEBP" ? "image/webp" : kind === "WAVE" ? "audio/wav" : kind === "AVI " ? "video/x-msvideo" : undefined;
  }
  if (text(4, 8) === "ftyp") {
    const brand = text(8, 12);
    if (/^(heic|heix|mif1|msf1)/.test(brand)) return "image/heic";
    if (/^avi[fs]/.test(brand)) return "image/avif";
    if (/^qt/.test(brand)) return "video/quicktime";
    if (/^M4A/.test(brand)) return "audio/mp4";
    return "video/mp4";
  }
  if (text(0, 4) === "fLaC") return "audio/flac";
  if (text(0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if ((text(0, 4) === "II*\0") || (text(0, 4) === "MM\0*")) return "image/tiff";
  return undefined;
}

const MEDIA_TYPE = /^(image|video|audio)\//;

function fileNameFor(url: URL, disposition: string | undefined, type: string): string {
  const fromHeader = disposition && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
  let name = fromHeader ? decodeURIComponent(fromHeader) : decodeURIComponent(url.pathname.split("/").pop() ?? "");
  name = name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "download";
  if (!extensionType(name)) {
    const ext = Object.entries({ jpg: "image/jpeg", png: "image/png", mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", webp: "image/webp", heic: "image/heic", avif: "image/avif", m4a: "audio/mp4", flac: "audio/flac", gif: "image/gif" }).find(([, t]) => t === type)?.[0];
    if (ext) name = `${name}.${ext}`;
  }
  return name;
}

function metaContent(html: string, key: string): string[] {
  const out: string[] = [];
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const prop = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (prop === key && content) out.push(content.replace(/&amp;/g, "&"));
  }
  return out;
}

function pageCandidates(html: string, base: URL): PageResult {
  const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim();
  const found: { url: string; type: "image" | "video" }[] = [];
  const add = (value: string, type: "image" | "video") => {
    try {
      const url = new URL(value, base);
      if ((url.protocol === "https:" || url.protocol === "http:") && !found.some((c) => c.url === url.href)) {
        found.push({ url: url.href, type });
      }
    } catch {}
  };
  for (const key of ["og:video:secure_url", "og:video:url", "og:video", "twitter:player:stream"]) {
    metaContent(html, key).forEach((v) => add(v, "video"));
  }
  for (const key of ["og:image:secure_url", "og:image:url", "og:image", "twitter:image"]) {
    metaContent(html, key).forEach((v) => add(v, "image"));
  }
  return { kind: "page", title, candidates: found.slice(0, 4) };
}

export async function fetchMedia(raw: string): Promise<FetchResult> {
  let url = checkUrl(raw);
  if (!(url instanceof URL)) return url;

  let res: http.IncomingMessage;
  for (let hop = 0; ; hop++) {
    try {
      res = await request(url);
    } catch (err) {
      if (err instanceof BlockedError) return error("blocked", "Links to private or local network addresses can't be checked.");
      if ((err as Error).message === "timeout") return error("timeout", "The site took too long to respond.");
      return error("network", "Couldn't reach that site. Check the link and try again.");
    }
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      if (hop >= MAX_REDIRECTS) return error("http", "That link redirects too many times.");
      const next = checkUrl(new URL(res.headers.location, url).href);
      if (!(next instanceof URL)) return next;
      url = next;
      continue;
    }
    if (status < 200 || status >= 300) {
      res.resume();
      return error("http", `The site returned an error (HTTP ${status}).`);
    }
    break;
  }

  const declared = (res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const length = Number(res.headers["content-length"]) || undefined;

  if (declared === "text/html" || declared === "application/xhtml+xml") {
    const html = (await readUpTo(res, MAX_PAGE_BYTES)).toString("utf8");
    return pageCandidates(html, url);
  }
  if (length && length > MAX_MEDIA_BYTES) {
    res.destroy();
    return error("too-large", "That file is larger than 200 MB, the most this checker accepts.");
  }

  // Look at the first bytes to confirm (or discover) that it's media.
  const iterator = res[Symbol.asyncIterator]();
  const first = await iterator.next().catch(() => ({ done: true, value: undefined }));
  const head: Buffer = first.done || !first.value ? Buffer.alloc(0) : (first.value as Buffer);
  const sniffed = sniffType(head);
  const type = MEDIA_TYPE.test(declared) ? declared : sniffed ?? extensionType(url.pathname);
  if (!type || !MEDIA_TYPE.test(type)) {
    res.destroy();
    return error("not-media", "That link isn't an image, video or audio file.");
  }

  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head.length) {
        sent += head.length;
        controller.enqueue(new Uint8Array(head));
      }
    },
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) return controller.close();
        const chunk = next.value as Buffer;
        sent += chunk.length;
        if (sent > MAX_MEDIA_BYTES) {
          res.destroy();
          return controller.error(new Error("too large"));
        }
        controller.enqueue(new Uint8Array(chunk));
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      res.destroy();
    },
  });

  return {
    kind: "media",
    body,
    contentType: type,
    fileName: fileNameFor(url, res.headers["content-disposition"], type),
    length,
    finalUrl: url.href,
  };
}
