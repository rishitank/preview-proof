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
  twitterDescription: string | null;
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

// All 252 HTML 4 named entities (the ones real pages use), as "name:hex-codepoint" pairs.
// Generated from Python's html.entities.name2codepoint. Names are case-sensitive (&Eacute; vs &eacute;).
const ENTITY_TABLE =
  "quot:22,amp:26,apos:27,lt:3c,gt:3e,nbsp:a0,iexcl:a1,cent:a2,pound:a3,curren:a4,yen:a5,brvbar:a6," +
  "sect:a7,uml:a8,copy:a9,ordf:aa,laquo:ab,not:ac,shy:ad,reg:ae,macr:af,deg:b0,plusmn:b1,sup2:b2," +
  "sup3:b3,acute:b4,micro:b5,para:b6,middot:b7,cedil:b8,sup1:b9,ordm:ba,raquo:bb,frac14:bc," +
  "frac12:bd,frac34:be,iquest:bf,Agrave:c0,Aacute:c1,Acirc:c2,Atilde:c3,Auml:c4,Aring:c5," +
  "AElig:c6,Ccedil:c7,Egrave:c8,Eacute:c9,Ecirc:ca,Euml:cb,Igrave:cc,Iacute:cd,Icirc:ce,Iuml:cf," +
  "ETH:d0,Ntilde:d1,Ograve:d2,Oacute:d3,Ocirc:d4,Otilde:d5,Ouml:d6,times:d7,Oslash:d8,Ugrave:d9," +
  "Uacute:da,Ucirc:db,Uuml:dc,Yacute:dd,THORN:de,szlig:df,agrave:e0,aacute:e1,acirc:e2,atilde:e3," +
  "auml:e4,aring:e5,aelig:e6,ccedil:e7,egrave:e8,eacute:e9,ecirc:ea,euml:eb,igrave:ec,iacute:ed," +
  "icirc:ee,iuml:ef,eth:f0,ntilde:f1,ograve:f2,oacute:f3,ocirc:f4,otilde:f5,ouml:f6,divide:f7," +
  "oslash:f8,ugrave:f9,uacute:fa,ucirc:fb,uuml:fc,yacute:fd,thorn:fe,yuml:ff,OElig:152,oelig:153," +
  "Scaron:160,scaron:161,Yuml:178,fnof:192,circ:2c6,tilde:2dc,Alpha:391,Beta:392,Gamma:393," +
  "Delta:394,Epsilon:395,Zeta:396,Eta:397,Theta:398,Iota:399,Kappa:39a,Lambda:39b,Mu:39c,Nu:39d," +
  "Xi:39e,Omicron:39f,Pi:3a0,Rho:3a1,Sigma:3a3,Tau:3a4,Upsilon:3a5,Phi:3a6,Chi:3a7,Psi:3a8," +
  "Omega:3a9,alpha:3b1,beta:3b2,gamma:3b3,delta:3b4,epsilon:3b5,zeta:3b6,eta:3b7,theta:3b8," +
  "iota:3b9,kappa:3ba,lambda:3bb,mu:3bc,nu:3bd,xi:3be,omicron:3bf,pi:3c0,rho:3c1,sigmaf:3c2," +
  "sigma:3c3,tau:3c4,upsilon:3c5,phi:3c6,chi:3c7,psi:3c8,omega:3c9,thetasym:3d1,upsih:3d2," +
  "piv:3d6,ensp:2002,emsp:2003,thinsp:2009,zwnj:200c,zwj:200d,lrm:200e,rlm:200f,ndash:2013," +
  "mdash:2014,lsquo:2018,rsquo:2019,sbquo:201a,ldquo:201c,rdquo:201d,bdquo:201e,dagger:2020," +
  "Dagger:2021,bull:2022,hellip:2026,permil:2030,prime:2032,Prime:2033,lsaquo:2039,rsaquo:203a," +
  "oline:203e,frasl:2044,euro:20ac,image:2111,weierp:2118,real:211c,trade:2122,alefsym:2135," +
  "larr:2190,uarr:2191,rarr:2192,darr:2193,harr:2194,crarr:21b5,lArr:21d0,uArr:21d1,rArr:21d2," +
  "dArr:21d3,hArr:21d4,forall:2200,part:2202,exist:2203,empty:2205,nabla:2207,isin:2208," +
  "notin:2209,ni:220b,prod:220f,sum:2211,minus:2212,lowast:2217,radic:221a,prop:221d,infin:221e," +
  "ang:2220,and:2227,or:2228,cap:2229,cup:222a,int:222b,there4:2234,sim:223c,cong:2245," +
  "asymp:2248,ne:2260,equiv:2261,le:2264,ge:2265,sub:2282,sup:2283,nsub:2284,sube:2286,supe:2287," +
  "oplus:2295,otimes:2297,perp:22a5,sdot:22c5,lceil:2308,rceil:2309,lfloor:230a,rfloor:230b," +
  "lang:2329,rang:232a,loz:25ca,spades:2660,clubs:2663,hearts:2665,diams:2666";

const NAMED_ENTITIES: Record<string, string> = Object.fromEntries(
  ENTITY_TABLE.split(",").map((pair) => {
    const [name, hex] = pair.split(":") as [string, string];
    return [name, String.fromCodePoint(parseInt(hex, 16))];
  }),
);

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code)) return whole;
      // As browsers do: NUL, surrogates and out-of-range values become the replacement character.
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "�";
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole;
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
  // Quote-aware: a ">" inside an attribute value ("Idea -> app") must not end the tag.
  const re = new RegExp(`<${name}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, "gi");
  const out: Attrs[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(parseAttrs(m[1] ?? ""));
  return out;
}

function meta(metas: Attrs[], keys: string[]): string | null {
  for (const key of keys) {
    for (const attr of ["property", "name"] as const) {
      // Skip empty values: platforms move on to the next candidate tag.
      for (const t of metas) {
        if ((t[attr] ?? "").toLowerCase() !== key) continue;
        const value = clean(t["content"]);
        if (value) return value;
      }
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
  const bodyStart = html.search(/<body\b/i);
  const head =
    headEnd !== -1 ? html.slice(0, headEnd) : bodyStart !== -1 ? html.slice(0, bodyStart) : html;

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
  const iconHref = clean(iconTag?.["href"]);
  // Inline icons (data:image/...) are valid favicons; anything else must be an http(s) URL.
  const favicon =
    iconHref && /^data:image\//i.test(iconHref) ? iconHref : absoluteHttpUrl(finalUrl, iconHref);

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
    twitterDescription: meta(metas, ["twitter:description"]),
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

/** A byte-order mark overrides any declared charset, as it does in browsers. */
function bomCharset(b: Uint8Array): string | null {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return "utf-8";
  if (b[0] === 0xff && b[1] === 0xfe) return "utf-16le";
  if (b[0] === 0xfe && b[1] === 0xff) return "utf-16be";
  return null;
}

export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const label = bomCharset(bytes) ?? detectCharset(contentType, bytes);
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
    /<title\b[^>]*>\s*(just a moment|attention required|checking your browser|vercel security checkpoint|ddos-guard|access denied|please wait)/i.test(
      head,
    ) ||
    /(_cf_chl_opt|challenge-platform|cf-chl-|__vercel_challenge|px-captcha|ddos-guard)/i.test(head)
  );
}
