import { envLimit, limitRequest } from "@/lib/server/rate-limit";

// Receives crash reports from the browser (src/components/ErrorReporter.tsx)
// and writes them to the server log, where they show up in Vercel's Logs
// tab. Reports hold the error and the page path only: never file names,
// file contents or the links people check.

const MAX_BODY = 8 * 1024;

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value ? value.slice(0, max) : undefined;
}

export async function POST(request: Request) {
  if (request.headers.get("x-ai-label-check") !== "1") return new Response(null, { status: 403 });
  if (!limitRequest(request, "report-error", envLimit("ERROR_REPORT_LIMIT_PER_MINUTE", 10)).ok) {
    return new Response(null, { status: 429 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const report = {
    message: text(body.message, 500),
    stack: text(body.stack, 4000),
    kind: text(body.kind, 40),
    path: text(body.path, 200),
    digest: text(body.digest, 100),
    userAgent: request.headers.get("user-agent")?.slice(0, 300),
  };
  if (!report.message) return new Response(null, { status: 400 });

  console.error(`[client-error] ${JSON.stringify(report)}`);
  return new Response(null, { status: 204 });
}
