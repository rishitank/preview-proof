/**
 * Server-side audit: fetches a public URL like a link-preview bot, with SSRF protection on
 * every network hop, then extracts the metadata the previews are built from.
 *
 * Network access is injected (`fetch`, `resolve`) so the whole pipeline can be integration
 * tested without touching the internet.
 */
import type { AuditData, AuditResponse, ImageCheck } from "./audit-types";
import { decodeBody, isBotChallenge, isGenericTitle, looksLikeHtml, parseHtml } from "./html";
import { areResolvedAddressesSafe, isIpLiteral, validateTargetUrl } from "./net-guard";

export const MAX_BYTES = 2 * 1024 * 1024;
export const PAGE_TIMEOUT_MS = 8000;
export const ASSET_TIMEOUT_MS = 5000;
export const MAX_REDIRECTS = 5;
export const USER_AGENT = "PreviewProofBot/1.0 (+link preview audit)";

export type Resolver = (host: string, signal: AbortSignal) => Promise<string[] | null>;
export type Deps = { fetch: typeof fetch; resolve: Resolver; now: () => number };

/** Resolves A and AAAA records over DNS-over-HTTPS. Returns null if resolution fails or finds nothing. */
export function dohResolver(fetchImpl: typeof fetch): Resolver {
  return async (host, signal) => {
    try {
      const answers = await Promise.all(
        (["A", "AAAA"] as const).map(async (type) => {
          const res = await fetchImpl(
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
            { headers: { accept: "application/dns-json" }, signal },
          );
          if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
          const json = (await res.json()) as {
            Status?: number;
            Answer?: { type: number; data: string }[];
          };
          if (json.Status !== 0 && json.Status !== 3) throw new Error(`DoH status ${json.Status}`);
          return (json.Answer ?? [])
            .filter((r) => r.type === 1 || r.type === 28)
            .map((r) => r.data);
        }),
      );
      const all = answers.flat();
      return all.length ? all : null;
    } catch {
      return null;
    }
  };
}

export const defaultDeps = (): Deps => ({
  fetch: (...args) => fetch(...args),
  resolve: dohResolver((...args) => fetch(...args)),
  now: () => Date.now(),
});

type FetchFailure = {
  ok: false;
  code: "blocked_host" | "blocked_port" | "invalid_url" | "fetch_failed" | "timeout";
  message: string;
};
type SafeFetchResult = { ok: true; res: Response; finalUrl: string; hops: number } | FetchFailure;

const UNREACHABLE = "We couldn't reach that page. Check the address is public and live.";
const RESOLVES_PRIVATE =
  "That address resolves to a private or local machine, so nobody on the internet could load it.";

const isAbort = (e: unknown, signal: AbortSignal) =>
  signal.aborted || (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError"));

/**
 * Rejects as soon as `signal` aborts, even if the wrapped promise ignores the signal.
 * Some runtimes and egress proxies don't abandon an in-flight fetch or body read on abort,
 * so the deadline has to be enforced here rather than trusted to the platform.
 */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(new DOMException("The operation timed out.", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("The operation timed out.", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Releases a response body we don't need. Not awaited: a stuck cancel must not stall the audit. */
function discard(res: Response) {
  try {
    res.body?.cancel().catch(() => {});
  } catch {
    /* body already locked or closed */
  }
}

/**
 * Fetches `start`, following redirects by hand. Every hop is re-validated (scheme, host, port)
 * and its DNS answers are checked, so neither a redirect nor a DNS record can steer us inward.
 */
export async function safeFetch(
  start: URL,
  init: RequestInit,
  signal: AbortSignal,
  deps: Deps,
): Promise<SafeFetchResult> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = current.hostname.replace(/^\[|\]$/g, "");
    let addrs: string[] | null;
    try {
      addrs = isIpLiteral(host) ? [host] : await raceAbort(deps.resolve(host, signal), signal);
    } catch {
      return signal.aborted
        ? { ok: false, code: "timeout", message: "timeout" }
        : { ok: false, code: "fetch_failed", message: UNREACHABLE };
    }
    if (signal.aborted) return { ok: false, code: "timeout", message: "timeout" };
    if (!addrs) return { ok: false, code: "fetch_failed", message: UNREACHABLE };
    if (!areResolvedAddressesSafe(addrs))
      return { ok: false, code: "blocked_host", message: RESOLVES_PRIVATE };

    let res: Response;
    try {
      res = await raceAbort(
        deps.fetch(current.toString(), { ...init, redirect: "manual", signal }),
        signal,
      );
    } catch (e) {
      return isAbort(e, signal)
        ? { ok: false, code: "timeout", message: "timeout" }
        : { ok: false, code: "fetch_failed", message: UNREACHABLE };
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      discard(res);
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return {
          ok: false,
          code: "fetch_failed",
          message: "The page redirected to an invalid address.",
        };
      }
      const v = validateTargetUrl(next);
      if (!v.ok)
        return { ok: false, code: v.code, message: `A redirect was blocked. ${v.message}` };
      current = v.url;
      continue;
    }
    return { ok: true, res, finalUrl: current.toString(), hops: hop };
  }
  return {
    ok: false,
    code: "fetch_failed",
    message: `The page redirected more than ${MAX_REDIRECTS} times.`,
  };
}

/**
 * Reads at most `limit` bytes of a body, cancelling the rest. If the deadline passes mid-body,
 * returns what arrived so far (the <head> usually has) and marks the result truncated.
 */
export async function readCapped(
  res: Response,
  limit: number,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; truncated: boolean; timedOut: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), truncated: false, timedOut: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  let timedOut = false;
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    try {
      step = await raceAbort(reader.read(), signal);
    } catch {
      truncated = true;
      timedOut = signal.aborted;
      reader.cancel().catch(() => {});
      break;
    }
    const { done, value } = step;
    if (done) break;
    const room = limit - total;
    if (value.byteLength > room) {
      chunks.push(value.subarray(0, room));
      total += room;
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return { bytes: out, truncated, timedOut };
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** Checks that an asset (preview image, favicon) is publicly reachable, without downloading it. */
export async function checkAsset(
  url: string,
  deps: Deps,
  accept = "image/*,*/*;q=0.8",
): Promise<ImageCheck> {
  const v = validateTargetUrl(url);
  if (!v.ok) return { ok: false, error: "blocked" };
  const t = withTimeout(ASSET_TIMEOUT_MS);
  try {
    const headers = { "user-agent": USER_AGENT, accept };
    let r = await safeFetch(v.url, { method: "HEAD", headers }, t.signal, deps);
    if (r.ok && (r.res.status === 405 || r.res.status === 403 || r.res.status === 501)) {
      discard(r.res);
      // Some servers reject HEAD; fall back to a tiny ranged GET.
      r = await safeFetch(
        v.url,
        { method: "GET", headers: { ...headers, range: "bytes=0-0" } },
        t.signal,
        deps,
      );
    }
    if (!r.ok) {
      const blocked =
        r.code === "blocked_host" || r.code === "blocked_port" || r.code === "invalid_url";
      return {
        ok: false,
        error: blocked ? "blocked" : r.code === "timeout" ? "timeout" : "unreachable",
      };
    }
    const res = r.res;
    discard(res);
    const contentRange = res.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
    const len = contentRange ?? res.headers.get("content-length");
    const contentType = res.headers.get("content-type");
    const okStatus = res.status >= 200 && res.status < 300;
    return {
      ok: okStatus,
      status: res.status,
      contentType,
      bytes: len && /^\d+$/.test(len) ? Number(len) : null,
    };
  } catch {
    return { ok: false, error: "unreachable" };
  } finally {
    t.done();
  }
}

export async function runAudit(rawUrl: string, deps: Deps = defaultDeps()): Promise<AuditResponse> {
  const validated = validateTargetUrl(rawUrl);
  if (!validated.ok)
    return { ok: false, error: { code: validated.code, message: validated.message } };
  const target = validated.url;

  const t = withTimeout(PAGE_TIMEOUT_MS);
  const started = deps.now();
  let fetched: SafeFetchResult;
  let body: { bytes: Uint8Array; truncated: boolean; timedOut: boolean };
  try {
    fetched = await safeFetch(
      target,
      {
        method: "GET",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "en",
        },
      },
      t.signal,
      deps,
    );
    if (!fetched.ok) {
      return {
        ok: false,
        error:
          fetched.code === "timeout"
            ? {
                code: "timeout",
                message: "The page took longer than 8 seconds to answer. Sharing bots give up too.",
              }
            : { code: fetched.code, message: fetched.message },
      };
    }
    body = await readCapped(fetched.res, MAX_BYTES, t.signal).catch(() => ({
      bytes: new Uint8Array(),
      truncated: false,
      timedOut: false,
    }));
    // A body cut off by the deadline is only worth auditing if the whole <head> arrived.
    const headArrived = /<\/head\s*>/i.test(
      new TextDecoder().decode(body.bytes.subarray(0, 256 * 1024)),
    );
    if (body.timedOut && !headArrived) {
      return {
        ok: false,
        error: {
          code: "timeout",
          message: "The page took longer than 8 seconds to answer. Sharing bots give up too.",
        },
      };
    }
  } finally {
    t.done();
  }

  const { res, finalUrl } = fetched;
  const responseTimeMs = deps.now() - started;
  const contentType = res.headers.get("content-type");
  const html = decodeBody(body.bytes, contentType);

  if (isBotChallenge(res.status, res.headers, html)) {
    return {
      ok: false,
      error: {
        code: "bot_blocked",
        message:
          "This site's firewall showed our checker a bot challenge instead of the page, so we can't see what sharing bots see. Verified crawlers like Twitterbot, Slackbot and facebookexternalhit are usually let through, so your real previews may be fine.",
      },
    };
  }

  if (!looksLikeHtml(contentType, html)) {
    const type = contentType?.split(";")[0]?.trim() || "something that isn't a web page";
    return {
      ok: false,
      error: {
        code: "not_html",
        message: `That address returns ${type}, not a web page. Paste the address of the page people will share.`,
      },
    };
  }

  const parsed = parseHtml(html, finalUrl);
  const headerRobots = res.headers.get("x-robots-tag");
  const noindex = parsed.noindex || /\bnoindex\b|\bnone\b/i.test(headerRobots ?? "");

  // Browsers and bots fall back to /favicon.ico when no icon is declared.
  const defaultFavicon = new URL("/favicon.ico", finalUrl).toString();
  const [ogImageCheck, faviconCheck] = await Promise.all([
    parsed.ogImage ? checkAsset(parsed.ogImage, deps) : Promise.resolve(null),
    parsed.favicon ? Promise.resolve(null) : checkAsset(defaultFavicon, deps),
  ]);
  const favicon = parsed.favicon ?? (faviconCheck?.ok ? defaultFavicon : null);

  const spaTrap =
    parsed.emptyRootDiv &&
    (isGenericTitle(parsed.title) || !parsed.description) &&
    (!parsed.ogTitle || !parsed.ogDescription);

  const data: AuditData = {
    requestedUrl: target.toString(),
    finalUrl,
    redirected: finalUrl !== target.toString(),
    status: res.status,
    responseTimeMs,
    contentType,
    ...parsed,
    noindex,
    robots: parsed.robots ?? headerRobots,
    favicon,
    faviconDeclared: parsed.favicon != null,
    ogImageCheck,
    htmlBytes: body.bytes.byteLength,
    truncated: body.truncated,
    spaTrap,
  };
  return { ok: true, data };
}
