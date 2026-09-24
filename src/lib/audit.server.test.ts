import { afterEach, describe, expect, it, vi } from "vitest";
import { dohResolver, MAX_BYTES, runAudit, type Deps } from "./audit.server";

/* ------------------------------------------------------------------ */
/* A fake internet: DNS records + URL handlers, with a request log.    */
/* ------------------------------------------------------------------ */

type Handler = (req: {
  method: string;
  headers: Headers;
  signal: AbortSignal;
}) => Response | Promise<Response>;

function fakeNet(opts: { dns?: Record<string, string[] | null>; routes: Record<string, Handler> }) {
  const log: {
    url: string;
    method: string;
    redirect: RequestRedirect | undefined;
    ua: string | null;
  }[] = [];
  const resolved: string[] = [];
  let clock = 0;
  const deps: Deps = {
    now: () => (clock += 25),
    resolve: async (host) => {
      resolved.push(host);
      return opts.dns && host in opts.dns ? opts.dns[host]! : ["93.184.216.34"];
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      log.push({
        url,
        method: init?.method ?? "GET",
        redirect: init?.redirect,
        ua: headers.get("user-agent"),
      });
      const handler = opts.routes[url];
      if (!handler)
        return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
      return handler({ method: init?.method ?? "GET", headers, signal: init!.signal! });
    }) as typeof fetch,
  };
  return { deps, log, resolved };
}

const html = (body: string, headers: Record<string, string> = {}, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });

const redirect = (to: string, status = 301) =>
  new Response(null, { status, headers: { location: to } });

const GOOD_PAGE = `<!doctype html><html lang="en"><head>
<title>Acme — invoices in one click</title>
<meta name="description" content="Acme turns timesheets into invoices automatically, so freelancers get paid faster and never chase a client again.">
<link rel="canonical" href="https://acme.example/">
<link rel="icon" href="/favicon.svg">
<meta property="og:title" content="Acme"><meta property="og:description" content="Invoices in one click">
<meta property="og:image" content="https://acme.example/og.png">
<meta name="twitter:card" content="summary_large_image">
</head><body><h1>Acme</h1><p>${"Real server-rendered content. ".repeat(20)}</p></body></html>`;

const image =
  (bytes = 120_000, type = "image/png") =>
  () =>
    new Response(null, {
      status: 200,
      headers: { "content-type": type, "content-length": String(bytes) },
    });

const expectError = async (p: ReturnType<typeof runAudit>, code: string, message?: RegExp) => {
  const r = await p;
  if (r.ok) throw new Error(`expected ${code}, got ok`);
  expect(r.error.code).toBe(code);
  if (message) expect(r.error.message).toMatch(message);
};

afterEach(() => vi.useRealTimers());

/* ------------------------------------------------------------------ */

describe("runAudit: happy path", () => {
  it("audits a well-formed page end to end", async () => {
    const net = fakeNet({
      routes: {
        "https://acme.example/": () => html(GOOD_PAGE),
        "https://acme.example/og.png": image(),
      },
    });
    const r = await runAudit("acme.example", net.deps);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data).toMatchObject({
      requestedUrl: "https://acme.example/",
      finalUrl: "https://acme.example/",
      redirected: false,
      status: 200,
      title: "Acme — invoices in one click",
      favicon: "https://acme.example/favicon.svg",
      faviconDeclared: true,
      ogImageCheck: { ok: true, status: 200, contentType: "image/png", bytes: 120_000 },
      spaTrap: false,
      truncated: false,
      noindex: false,
    });
    expect(r.data.responseTimeMs).toBeGreaterThan(0);
  });

  it("identifies itself, never auto-follows redirects, and checks DNS before every request", async () => {
    const net = fakeNet({
      routes: {
        "https://acme.example/": () => html(GOOD_PAGE),
        "https://acme.example/og.png": image(),
      },
    });
    await runAudit("https://acme.example/", net.deps);
    expect(net.log.length).toBeGreaterThan(0);
    for (const req of net.log) {
      expect(req.redirect).toBe("manual");
      expect(req.ua).toMatch(/^PreviewProofBot\//);
    }
    expect(net.resolved.length).toBe(net.log.length);
  });

  it("does not touch the network for invalid or private input", async () => {
    const net = fakeNet({ routes: {} });
    await expectError(runAudit("ftp://acme.example", net.deps), "invalid_url");
    await expectError(runAudit("http://127.0.0.1", net.deps), "blocked_host");
    await expectError(runAudit("https://acme.example:8443", net.deps), "blocked_port");
    expect(net.log).toHaveLength(0);
    expect(net.resolved).toHaveLength(0);
  });
});

describe("runAudit: redirects", () => {
  it("follows a normal chain and reports the final URL", async () => {
    const net = fakeNet({
      routes: {
        "http://acme.example/": () => redirect("https://acme.example/"),
        "https://acme.example/": () => redirect("/home", 302),
        "https://acme.example/home": () => html(GOOD_PAGE),
        "https://acme.example/og.png": image(),
      },
    });
    const r = await runAudit("http://acme.example", net.deps);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.finalUrl).toBe("https://acme.example/home");
    expect(r.data.redirected).toBe(true);
  });

  it.each([
    ["an IP literal", "http://127.0.0.1/admin", "blocked_host"],
    ["IPv4-mapped IPv6", "http://[::ffff:169.254.169.254]/latest/meta-data", "blocked_host"],
    ["localhost", "http://localhost/", "blocked_host"],
    ["a metadata hostname", "http://metadata.google.internal/computeMetadata/v1/", "blocked_host"],
    ["a non-standard port", "https://acme.example:6379/", "blocked_port"],
    ["a non-http scheme", "file:///etc/passwd", "invalid_url"],
  ])("blocks a redirect to %s", async (_label, to, code) => {
    const net = fakeNet({ routes: { "https://acme.example/": () => redirect(to, 302) } });
    await expectError(runAudit("acme.example", net.deps), code, /redirect was blocked/i);
    expect(net.log.map((l) => l.url)).toEqual(["https://acme.example/"]);
  });

  it("blocks a redirect to a public-looking name that resolves privately (DNS rebinding)", async () => {
    const net = fakeNet({
      dns: { "rebind.attacker.example": ["10.0.0.7"] },
      routes: { "https://acme.example/": () => redirect("https://rebind.attacker.example/") },
    });
    await expectError(runAudit("acme.example", net.deps), "blocked_host", /private or local/);
    expect(net.log).toHaveLength(1);
  });

  it("gives up after 5 redirects", async () => {
    const routes: Record<string, Handler> = {};
    for (let i = 0; i < 10; i++) routes[`https://acme.example/${i}`] = () => redirect(`/${i + 1}`);
    const net = fakeNet({ routes });
    await expectError(
      runAudit("https://acme.example/0", net.deps),
      "fetch_failed",
      /more than 5 times/,
    );
    expect(net.log).toHaveLength(6);
  });

  it("stops a redirect loop", async () => {
    const net = fakeNet({
      routes: {
        "https://a.example/": () => redirect("https://b.example/"),
        "https://b.example/": () => redirect("https://a.example/"),
      },
    });
    await expectError(runAudit("a.example", net.deps), "fetch_failed", /redirected more than/);
  });

  it("treats a 3xx without a Location header as the final response", async () => {
    const net = fakeNet({
      routes: { "https://acme.example/": () => html("<title>Choose</title>", {}, 300) },
    });
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && r.data.status).toBe(300);
  });
});

describe("runAudit: DNS", () => {
  it("blocks a hostname whose records include any private address", async () => {
    const net = fakeNet({
      dns: { "mixed.example": ["93.184.216.34", "192.168.0.10"] },
      routes: {},
    });
    await expectError(runAudit("mixed.example", net.deps), "blocked_host");
    expect(net.log).toHaveLength(0);
  });

  it("blocks a hostname that resolves to an IPv6 loopback", async () => {
    const net = fakeNet({ dns: { "v6.example": ["::1"] }, routes: {} });
    await expectError(runAudit("v6.example", net.deps), "blocked_host");
  });

  it("reports an unresolvable hostname as unreachable", async () => {
    const net = fakeNet({ dns: { "nxdomain.example": null }, routes: {} });
    await expectError(runAudit("nxdomain.example", net.deps), "fetch_failed", /couldn't reach/);
  });
});

describe("runAudit: failures, limits and content types", () => {
  it("times out a server that never answers, at 8 seconds", async () => {
    vi.useFakeTimers();
    const net = fakeNet({
      routes: {
        "https://slow.example/": ({ signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      },
    });
    const p = runAudit("slow.example", net.deps);
    await vi.advanceTimersByTimeAsync(7999);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expectError(p, "timeout", /8 seconds/);
  });

  it("times out a server that sends headers but trickles the body forever", async () => {
    vi.useFakeTimers();
    const net = fakeNet({
      routes: {
        "https://drip.example/": ({ signal }) =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode("<html><head>"));
                signal.addEventListener("abort", () =>
                  c.error(new DOMException("aborted", "AbortError")),
                );
              },
            }),
            { headers: { "content-type": "text/html" } },
          ),
      },
    });
    const p = runAudit("drip.example", net.deps);
    await vi.advanceTimersByTimeAsync(8001);
    await expectError(p, "timeout");
  });

  it("still times out at 8 seconds when the platform fetch ignores the abort signal", async () => {
    vi.useFakeTimers();
    const net = fakeNet({
      routes: { "https://deaf.example/": () => new Promise<Response>(() => {}) },
    });
    const p = runAudit("deaf.example", net.deps);
    await vi.advanceTimersByTimeAsync(8001);
    await expectError(p, "timeout", /8 seconds/);
  });

  it("still times out when the DNS lookup ignores the abort signal", async () => {
    vi.useFakeTimers();
    const net = fakeNet({ routes: {} });
    net.deps.resolve = () => new Promise(() => {});
    const p = runAudit("slowdns.example", net.deps);
    await vi.advanceTimersByTimeAsync(8001);
    await expectError(p, "timeout");
  });

  it("audits what arrived when the body stalls after a complete <head>", async () => {
    vi.useFakeTimers();
    const net = fakeNet({
      routes: {
        "https://stall.example/": () =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(
                  new TextEncoder().encode(
                    "<html><head><title>Head arrived</title></head><body><h1>x",
                  ),
                );
              }, // never closes, and ignores abort
            }),
            { headers: { "content-type": "text/html" } },
          ),
      },
    });
    const p = runAudit("stall.example", net.deps);
    await vi.advanceTimersByTimeAsync(8001);
    const r = await p;
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.title).toBe("Head arrived");
    expect(r.data.truncated).toBe(true);
  });

  it("reports a refused connection as unreachable", async () => {
    const net = fakeNet({
      routes: {
        "https://down.example/": () => {
          throw new TypeError("fetch failed: ECONNREFUSED");
        },
      },
    });
    await expectError(runAudit("down.example", net.deps), "fetch_failed");
  });

  it("caps the download at 2 MB but still parses the head", async () => {
    const big = `<html><head><title>Huge page</title></head><body>${"x".repeat(3 * 1024 * 1024)}</body></html>`;
    const net = fakeNet({ routes: { "https://big.example/": () => html(big) } });
    const r = await runAudit("big.example", net.deps);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.data.truncated).toBe(true);
    expect(r.data.htmlBytes).toBe(MAX_BYTES);
    expect(r.data.title).toBe("Huge page");
  });

  it.each([
    ["image/png", "\x89PNG...."],
    ["application/json", '{"ok":true}'],
    ["application/pdf", "%PDF-1.7"],
  ])("refuses a %s response with a helpful message", async (type, body) => {
    const net = fakeNet({
      routes: {
        "https://acme.example/file": () =>
          new Response(body, { headers: { "content-type": type } }),
      },
    });
    await expectError(
      runAudit("https://acme.example/file", net.deps),
      "not_html",
      new RegExp(type.replace("/", "\\/")),
    );
  });

  it("sniffs HTML when the server sends no Content-Type", async () => {
    const net = fakeNet({
      routes: {
        "https://acme.example/": () => new Response("<!doctype html><title>Sniffed</title>"),
      },
    });
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && r.data.title).toBe("Sniffed");
  });

  it("still audits an error page and reports its status", async () => {
    const net = fakeNet({
      routes: { "https://acme.example/gone": () => html("<title>Not found</title>", {}, 404) },
    });
    const r = await runAudit("https://acme.example/gone", net.deps);
    expect(r.ok && r.data.status).toBe(404);
  });

  it("decodes a windows-1252 page", async () => {
    const bytes = Uint8Array.from([
      ...new TextEncoder().encode('<html><head><meta charset="windows-1252"><title>Caf'),
      0xe9,
      ...new TextEncoder().encode("</title></head></html>"),
    ]);
    const net = fakeNet({
      routes: {
        "https://cafe.example/": () =>
          new Response(bytes, { headers: { "content-type": "text/html" } }),
      },
    });
    const r = await runAudit("cafe.example", net.deps);
    expect(r.ok && r.data.title).toBe("Café");
  });

  it("honours an X-Robots-Tag: noindex header", async () => {
    const net = fakeNet({
      routes: { "https://acme.example/": () => html(GOOD_PAGE, { "x-robots-tag": "noindex" }) },
    });
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && r.data.noindex).toBe(true);
  });
});

describe("runAudit: preview image and favicon checks", () => {
  const withImage = (img: string, extra: Record<string, Handler> = {}) =>
    fakeNet({
      routes: {
        "https://acme.example/": () => html(GOOD_PAGE.replace("https://acme.example/og.png", img)),
        ...extra,
      },
    });

  it("never fetches an og:image that points at a private address", async () => {
    const net = withImage("http://169.254.169.254/latest/meta-data/iam");
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && r.data.ogImageCheck).toEqual({ ok: false, error: "blocked" });
    expect(net.log.some((l) => l.url.includes("169.254"))).toBe(false);
  });

  it("blocks an og:image that redirects to a private address", async () => {
    const net = withImage("https://cdn.example/og.png", {
      "https://cdn.example/og.png": () => redirect("http://10.0.0.1/secret.png"),
    });
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && r.data.ogImageCheck).toEqual({ ok: false, error: "blocked" });
    expect(net.log.some((l) => l.url.includes("10.0.0.1"))).toBe(false);
  });

  it("reports a missing image with its status", async () => {
    const net = withImage("https://acme.example/missing.png");
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && r.data.ogImageCheck).toMatchObject({ ok: false, status: 404 });
  });

  it("falls back to a ranged GET when HEAD is not allowed, and reads the size from Content-Range", async () => {
    const net = withImage("https://cdn.example/og.jpg", {
      "https://cdn.example/og.jpg": ({ method, headers }) =>
        method === "HEAD"
          ? new Response(null, { status: 405 })
          : new Response("x", {
              status: headers.get("range") ? 206 : 200,
              headers: { "content-type": "image/jpeg", "content-range": "bytes 0-0/734003" },
            }),
    });
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && r.data.ogImageCheck).toEqual({
      ok: true,
      status: 206,
      contentType: "image/jpeg",
      bytes: 734003,
    });
  });

  it("records the content type so a page-instead-of-image can be flagged", async () => {
    const net = withImage("https://acme.example/share", {
      "https://acme.example/share": image(5000, "text/html"),
    });
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && r.data.ogImageCheck?.contentType).toBe("text/html");
  });

  it("finds /favicon.ico when no icon is declared, and says so", async () => {
    const page = GOOD_PAGE.replace('<link rel="icon" href="/favicon.svg">', "");
    const net = fakeNet({
      routes: {
        "https://acme.example/": () => html(page),
        "https://acme.example/og.png": image(),
        "https://acme.example/favicon.ico": image(1000, "image/x-icon"),
      },
    });
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && [r.data.favicon, r.data.faviconDeclared]).toEqual([
      "https://acme.example/favicon.ico",
      false,
    ]);
  });

  it("reports no favicon when neither a declared icon nor /favicon.ico exists", async () => {
    const page = GOOD_PAGE.replace('<link rel="icon" href="/favicon.svg">', "");
    const net = fakeNet({
      routes: { "https://acme.example/": () => html(page), "https://acme.example/og.png": image() },
    });
    const r = await runAudit("acme.example", net.deps);
    expect(r.ok && r.data.favicon).toBeNull();
  });

  it("does not let a slow image stall the audit beyond its own 5 second budget", async () => {
    vi.useFakeTimers();
    const net = withImage("https://slowcdn.example/og.png", {
      "https://slowcdn.example/og.png": ({ signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        ),
    });
    const p = runAudit("acme.example", net.deps);
    await vi.advanceTimersByTimeAsync(5001);
    const r = await p;
    expect(r.ok && r.data.ogImageCheck).toEqual({ ok: false, error: "timeout" });
  });
});

describe("dohResolver", () => {
  const doh = (answers: Record<string, unknown>, status = 200) =>
    dohResolver((async (url: string) => {
      const type = new URL(url).searchParams.get("type")!;
      return new Response(JSON.stringify(answers[type]), { status });
    }) as unknown as typeof fetch);
  const signal = new AbortController().signal;

  it("returns A and AAAA addresses and skips CNAME records", async () => {
    const resolve = doh({
      A: {
        Status: 0,
        Answer: [
          { type: 5, data: "alias.example." },
          { type: 1, data: "93.184.216.34" },
        ],
      },
      AAAA: { Status: 0, Answer: [{ type: 28, data: "2606:2800:220:1::1" }] },
    });
    expect(await resolve("acme.example", signal)).toEqual(["93.184.216.34", "2606:2800:220:1::1"]);
  });

  it("returns null for NXDOMAIN, SERVFAIL and HTTP errors", async () => {
    expect(await doh({ A: { Status: 3 }, AAAA: { Status: 3 } })("nope.example", signal)).toBeNull();
    expect(await doh({ A: { Status: 2 }, AAAA: { Status: 0 } })("fail.example", signal)).toBeNull();
    expect(await doh({}, 503)("down.example", signal)).toBeNull();
  });
});
