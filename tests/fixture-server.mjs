// Serves test fixtures over HTTP so the "check a link" tests exercise real
// downloads, redirects and web pages. Started by playwright.config.ts.
import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const port = Number(process.env.FIXTURE_PORT ?? 3199);
const types = { ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".wav": "audio/wav" };

const pages = {
  "/page.html": `<!doctype html><html><head><title>News story</title>
    <meta property="og:image" content="/C.jpg">
    <meta property="og:video" content="/media/video1.mp4">
    </head><body>Story</body></html>`,
  "/empty-page.html": "<!doctype html><html><head><title>Nothing here</title></head><body>Text only</body></html>",
};

function sendFile(res, file, type) {
  const size = statSync(file).size;
  res.writeHead(200, { "content-type": type, "content-length": size });
  createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (pages[url.pathname]) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(pages[url.pathname]);
    }
    if (url.pathname === "/redirect") {
      res.writeHead(302, { location: "/C.jpg" });
      return res.end();
    }
    if (url.pathname === "/to-private") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    if (url.pathname === "/download") {
      // Generic binary type and no extension: the checker must sniff it.
      return sendFile(res, path.join(root, "C.jpg"), "application/octet-stream");
    }
    if (url.pathname === "/notes.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("just some text");
    }
    if (url.pathname === "/drawing.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      return res.end('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    }
    const file = path.join(root, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      if (statSync(file).isFile()) return sendFile(res, file, types[path.extname(file)] ?? "application/octet-stream");
    } catch {}
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  })
  .listen(port, "127.0.0.1", () => console.log(`fixture server on http://127.0.0.1:${port}`));
