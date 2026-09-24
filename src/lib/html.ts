/**
 * Extracts the metadata a link-preview bot sees from raw HTML (no JavaScript).
 * Pure and dependency-free so it can run on the server and in tests.
 */

export type ParsedHtml = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  noindex: boolean;
  lang: string | null;
  favicon: string | null;
  h1Count: number;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogImageRelative: boolean;
  ogUrl: string | null;
  ogType: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterImage: string | null;
  bodyTextLength: number;
  emptyRootDiv: boolean;
  /** Signs of Lovable's legacy Vite template (author meta or its default share image). */
  builtWithLovable: boolean;
  /** og:image is a builder's stock placeholder rather than the site's own image. */
  ogImageIsPlaceholder: boolean;
};

/** Default titles that tools and templates ship with. Compared case-insensitively and exactly. */
const GENERIC_TITLES = new Set([
  "lovable app",
  "lovable generated project",
  "react app",
  "vite + react",
  "vite + react + ts",
  "vite + react + typescript",
  "vite app",
  "untitled",
  "document",
  "home",
  "index",
  "app",
  "my app",
  "create next app",
  "new project",
]);

export function isGenericTitle(value: string | null): boolean {
  if (!value) return true;
  return GENERIC_TITLES.has(value.toLowerCase().replace(/\s+/g, " ").trim());
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function clean(v: string | null | undefined): string | null {
  if (v == null) return null;
  const out = decodeEntities(v).replace(/\s+/g, " ").trim();
  return out.length ? out : null;
}

type Attrs = Record<string, string>;

function parseAttrs(src: string): Attrs {
  const attrs: Attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const key = m[1]!.toLowerCase();
    if (!(key in attrs)) attrs[key] = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return attrs;
}

function tags(html: string, name: string): Attrs[] {
  const re = new RegExp(`<${name}\\b([^>]*)>`, "gi");
  const out: Attrs[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(parseAttrs(m[1] ?? ""));
  return out;
}

function meta(metas: Attrs[], keys: string[]): string | null {
  for (const key of keys) {
    for (const attr of ["property", "name"] as const) {
      const hit = metas.find((t) => (t[attr] ?? "").toLowerCase() === key && t["content"] != null);
      if (hit) return clean(hit["content"]);
    }
  }
  return null;
}

/** Resolves href against base and keeps it only if it is an http(s) URL. */
export function absoluteHttpUrl(base: string, href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const isAbsoluteHttp = (v: string) => /^https?:\/\//i.test(v);

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};

/** Stock share images that builders ship in their templates. */
export function isPlaceholderImage(url: string | null): boolean {
  if (!url) return false;
  return /lovable\.dev\/opengraph-image|lovable\.dev\/og-image|placeholder\.(png|jpg|svg)|\/vite\.svg$/i.test(
    url,
  );
}

/** A JS app shell: an empty mount element (or empty body) plus a script bundle that fills it in. */
function looksLikeClientRenderedShell(rawHtml: string, bodyText: string): boolean {
  const withoutComments = rawHtml.replace(/<!--[\s\S]*?-->/g, "");
  const hasBundle = /<script\b[^>]*(\bsrc\s*=|\btype\s*=\s*["']?module)/i.test(withoutComments);
  const emptyMount =
    /<(div|main|section)\b[^>]*\bid\s*=\s*["']?(root|app|__next|__nuxt|svelte|___gatsby|main)["']?[^>]*>\s*<\/\1\s*>/i.test(
      withoutComments,
    );
  return hasBundle && (emptyMount || bodyText.length === 0);
}

export function parseHtml(rawHtml: string, finalUrl: string): ParsedHtml {
  // Comments, scripts, styles and templates can contain tag-like text that bots ignore.
  const html = rawHtml
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, " ");

  const headEnd = html.search(/<\/head\s*>/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);

  const metas = tags(head, "meta");
  const links = tags(head, "link");

  // Only the document title: an inline <svg><title> in the body must not count.
  const titleMatch = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = clean(titleMatch?.[1]);

  const lang = clean(tags(html, "html")[0]?.["lang"]);

  const rels = (t: Attrs) => (t["rel"] ?? "").toLowerCase().split(/\s+/);
  const canonical = absoluteHttpUrl(
    finalUrl,
    clean(links.find((l) => rels(l).includes("canonical"))?.["href"]),
  );
  const iconTag =
    links.find((l) => rels(l).includes("icon")) ??
    links.find((l) => rels(l).includes("apple-touch-icon"));
  const favicon = absoluteHttpUrl(finalUrl, clean(iconTag?.["href"]));

  const robots = meta(metas, ["robots"]);
  const noindex = /\bnoindex\b|\bnone\b/i.test(robots ?? "");

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*)$/i);
  const bodyHtml = bodyMatch?.[1] ?? (headEnd === -1 ? "" : html.slice(headEnd));
  const h1Count = (bodyHtml.match(/<h1\b[^>]*>/gi) ?? []).length;
  const bodyText =
    clean(
      bodyHtml.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ").replace(/<[^>]+>/g, " "),
    ) ?? "";

  const ogImageRaw = meta(metas, ["og:image", "og:image:url", "og:image:secure_url"]);
  const twitterImageRaw = meta(metas, ["twitter:image", "twitter:image:src"]);

  return {
    title,
    description: meta(metas, ["description"]),
    canonical,
    robots,
    noindex,
    lang,
    favicon,
    h1Count,
    ogTitle: meta(metas, ["og:title"]),
    ogDescription: meta(metas, ["og:description"]),
    ogImage: absoluteHttpUrl(finalUrl, ogImageRaw),
    ogImageRelative: ogImageRaw != null && !isAbsoluteHttp(ogImageRaw),
    ogUrl: meta(metas, ["og:url"]),
    ogType: meta(metas, ["og:type"]),
    twitterCard: meta(metas, ["twitter:card"])?.toLowerCase() ?? null,
    twitterTitle: meta(metas, ["twitter:title"]),
    twitterImage: absoluteHttpUrl(finalUrl, twitterImageRaw),
    bodyTextLength: bodyText.length,
    // Short text alone isn't enough: a small static page is not a JS shell.
    emptyRootDiv: bodyText.length < 160 && looksLikeClientRenderedShell(rawHtml, bodyText),
    builtWithLovable:
      /\.lovable\.app$/i.test(hostOf(finalUrl)) ||
      (meta(metas, ["author"]) ?? "").toLowerCase() === "lovable" ||
      isPlaceholderImage(ogImageRaw),
    ogImageIsPlaceholder: isPlaceholderImage(ogImageRaw),
  };
}

/** Finds the declared charset from the Content-Type header or a <meta charset> in the first 1 KB. */
export function detectCharset(contentType: string | null, firstBytes: Uint8Array): string {
  const fromHeader = contentType?.match(/charset\s*=\s*"?([\w.:-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  // Byte-to-char sniff that works in every runtime (some edge runtimes only ship a UTF-8 TextDecoder).
  const sniff = String.fromCharCode(...firstBytes.subarray(0, 1024));
  const fromMeta =
    sniff.match(/<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i)?.[1] ??
    sniff.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([\w.:-]+)/i)?.[1];
  return (fromMeta ?? "utf-8").toLowerCase();
}

export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const label = detectCharset(contentType, bytes);
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Is this response a web page? Uses Content-Type, and sniffs the body when the header is missing. */
export function looksLikeHtml(contentType: string | null, bodyStart: string): boolean {
  if (contentType) {
    const type = contentType.split(";")[0]!.trim().toLowerCase();
    if (type === "text/html" || type === "application/xhtml+xml") return true;
    if (type !== "text/plain" && type !== "application/octet-stream" && type !== "") return false;
  }
  return /<(!doctype\s+html|html|head|body|meta|title)\b/i.test(bodyStart.slice(0, 4096));
}

/**
 * Recognises anti-bot interstitials (Cloudflare "Just a moment...", Vercel checkpoint, DDoS-Guard,
 * PerimeterX and similar). Auditing one of these would grade the firewall page, not the site.
 */
export function isBotChallenge(status: number, headers: Headers, html: string): boolean {
  if ((headers.get("cf-mitigated") ?? "").toLowerCase() === "challenge") return true;
  if (status !== 403 && status !== 429 && status !== 503) return false;
  const head = html.slice(0, 64 * 1024);
  return (
    /<title>\s*(just a moment|attention required|checking your browser|vercel security checkpoint|ddos-guard|access denied|please wait)/i.test(
      head,
    ) ||
    /(_cf_chl_opt|challenge-platform|cf-chl-|__vercel_challenge|px-captcha|ddos-guard)/i.test(head)
  );
}
