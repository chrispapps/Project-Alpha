// A small fixed-window rate limiter kept in server memory.
//
// On Vercel, each running instance keeps its own counts, so this is a
// best-effort brake against scripts hammering an endpoint, not a hard quota.
// For a strict, shared limit add a Vercel Firewall rate-limit rule (see README).

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** The caller's IP as reported by the hosting proxy, if any. */
export function clientIp(request: Request): string | undefined {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  if (windows.size > 10_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  current.count += 1;
  if (current.count <= limit) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}

/**
 * Limits a request by caller IP. Requests with no IP header (local runs,
 * tests) aren't limited, since they don't come through the hosting proxy.
 */
export function limitRequest(request: Request, name: string, perMinute: number) {
  const ip = clientIp(request);
  if (!ip) return { ok: true } as const;
  return rateLimit(`${name}:${ip}`, perMinute, 60_000);
}

export function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
