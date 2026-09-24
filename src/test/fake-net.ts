/**
 * A tiny fake internet for browser tests. Only loaded when the dev server runs with
 * PREVIEWPROOF_FAKE_NET=1 (set by playwright.config.ts); production never sets it.
 */
import type { Deps } from "@/lib/audit.server";

const PUBLIC_IP = "93.184.216.34";

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });

const image = (bytes: number) =>
  new Response(null, {
    status: 200,
    headers: { "content-type": "image/png", "content-length": String(bytes) },
  });

const GOOD = `<!doctype html><html lang="en"><head>
<title>Acme: invoices in one click</title>
<meta name="description" content="Acme turns timesheets into invoices automatically, so freelancers get paid faster and never chase a client again.">
<link rel="canonical" href="https://good.example/"><link rel="icon" href="/favicon.svg">
<meta property="og:title" content="Acme"><meta property="og:description" content="Invoices in one click">
<meta property="og:image" content="https://good.example/og.png"><meta name="twitter:card" content="summary_large_image">
</head><body><main><h1>Acme</h1><p>${"Real server-rendered content. ".repeat(20)}</p></main></body></html>`;

const SPA = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Vite + React + TS</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;

const LOVABLE_OLD = `<!doctype html><html lang="en"><head><title>Lovable App</title>
<meta name="author" content="Lovable"><meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png">
</head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;

const CHALLENGE = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={}</script></body></html>`;

const routes: Record<string, () => Response | Promise<Response>> = {
  "https://good.example/": () => html(GOOD),
  "https://good.example/og.png": () => image(120_000),
  "https://spa.example/": () => html(SPA),
  "https://lovable-old.example/": () => html(LOVABLE_OLD),
  "https://lovable.dev/opengraph-image-p98pqg.png": () => image(90_000),
  "https://guarded.example/": () => html(CHALLENGE, 403, { "cf-mitigated": "challenge" }),
  "https://heavy.example/": () => html(GOOD.replaceAll("good.example", "heavy.example")),
  "https://heavy.example/og.png": () => image(900_000),
};

export function fakeDeps(): Deps {
  return {
    now: () => Date.now(),
    resolve: async (host) => (host === "rebind.example" ? ["10.0.0.1"] : [PUBLIC_IP]),
    fetch: (async (input: RequestInfo | URL) => {
      const handler = routes[String(input)];
      return handler ? handler() : html("<title>Not found</title>", 404);
    }) as typeof fetch,
  };
}
