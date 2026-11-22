import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home", ".corp"];

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb")) return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

/** Validates scheme, credentials, hostname and resolved addresses. Throws UnsafeUrlError. */
export async function assertSafeUrl(input: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Invalid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("Only http(s) URLs are allowed.");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("Local/internal hostnames are not allowed.");
  }
  if (url.port && !["80", "443", ""].includes(url.port)) throw new UnsafeUrlError("Non-standard ports are not allowed.");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrlError("Private or reserved IP addresses are not allowed.");
    return url;
  }
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve host ${host}.`);
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("Host resolves to a private or reserved address.");
  }
  return url;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  method?: "GET" | "HEAD";
}

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  contentType: string;
  text: string;
  truncated: boolean;
}

export const USER_AGENT = "WishluckStudioBot/1.0 (+assessment-research; respects robots.txt)";

/** SSRF-safe fetch: validates every redirect hop, applies timeout and a response size cap. */
export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { timeoutMs = 12000, maxBytes = 3_000_000, maxRedirects = 4 } = opts;
  let current = (await assertSafeUrl(input)).toString();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current, {
        method: opts.method ?? "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.5", ...opts.headers },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = new URL(res.headers.get("location")!, current).toString();
        current = (await assertSafeUrl(next)).toString();
        continue;
      }
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      let truncated = false;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > maxBytes) {
            truncated = true;
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      return {
        status: res.status,
        finalUrl: current,
        contentType: res.headers.get("content-type") ?? "",
        text: Buffer.concat(chunks).toString("utf8"),
        truncated,
      };
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw err;
      if ((err as Error).name === "AbortError") throw new Error(`Request timed out after ${timeoutMs}ms: ${current}`);
      throw new Error(`Network error fetching ${current}: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new UnsafeUrlError("Too many redirects.");
}

// ---- simple in-memory rate limiter (per key, fixed window) ----
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  return { ok: b.count <= limit, retryAfterSec: Math.ceil((b.reset - now) / 1000) };
}

const lastHit = new Map<string, number>();
/** Politeness delay between requests to the same domain. */
export async function politeDelay(domain: string, minGapMs = 1200) {
  const prev = lastHit.get(domain) ?? 0;
  const wait = prev + minGapMs - Date.now();
  lastHit.set(domain, Math.max(Date.now(), prev + minGapMs));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
