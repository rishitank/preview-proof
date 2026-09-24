import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AuditData, AuditResponse, ImageCheck } from "./audit-types";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const TIMEOUT_MS = 8000;
const UA = "PreviewProofBot/1.0";

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "0.0.0.0",
  "[::1]",
  "::1",
  "metadata.google.internal",
]);

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, Number(m[2]), Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("::ffff:")) return isPrivateIPv4(h.slice(7));
  return false;
}

export function validateTargetUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; code: "invalid_url" | "blocked_host" | "blocked_port"; message: string } {
  let candidate = raw.trim();
  if (!candidate) return { ok: false, code: "invalid_url", message: "Please paste a URL first." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, code: "invalid_url", message: "That doesn't look like a valid web address." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, code: "invalid_url", message: "Only http:// and https:// addresses can be checked." };
  }

  const host = url.hostname.toLowerCase();
  if (
    PRIVATE_HOSTNAMES.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateIPv4(host) ||
    isPrivateIPv6(host)
  ) {
    return {
      ok: false,
      code: "blocked_host",
      message: "That address points at a private or local machine, so nobody on the internet could load it.",
    };
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    return {
      ok: false,
      code: "blocked_port",
      message: "Only standard web ports (80 and 443) can be checked.",
    };
  }

  url.hash = "";
  return { ok: true, url };
}

/* ---------------- HTML parsing helpers ---------------- */

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function clean(v: string | null): string | null {
  if (v == null) return null;
  const out = decodeEntities(v).replace(/\s+/g, " ").trim();
  return out.length ? out : null;
}

type Tag = { name: string; attrs: Record<string, string> };

function parseTags(html: string, tagName: string): Tag[] {
  const re = new RegExp(`<${tagName}\\b([^>]*)>`, "gi");
  const out: Tag[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(m[1] ?? ""))) {
      attrs[a[1]!.toLowerCase()] = decodeEntities(a[3] ?? a[4] ?? a[5] ?? "");
    }
    out.push({ name: tagName, attrs });
  }
  return out;
}

function metaContent(metas: Tag[], keys: string[], attr: "name" | "property"): string | null {
  for (const key of keys) {
    const hit = metas.find((t) => (t.attrs[attr] ?? "").toLowerCase() === key);
    if (hit && hit.attrs["content"] != null) return clean(hit.attrs["content"]!);
  }
  // some sites swap name/property
  const other = attr === "name" ? "property" : "name";
  for (const key of keys) {
    const hit = metas.find((t) => (t.attrs[other] ?? "").toLowerCase() === key);
    if (hit && hit.attrs["content"] != null) return clean(hit.attrs["content"]!);
  }
  return null;
}

function absolute(base: string, href: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

const GENERIC_TITLES = [
  "lovable app",
  "lovable generated project",
  "react app",
  "vite + react + ts",
  "vite app",
  "untitled",
  "home",
  "document",
  "app",
  "my app",
  "create next app",
];

function isGeneric(value: string | null): boolean {
  if (!value) return true;
  const v = value.toLowerCase().trim();
  if (v.length < 6) return true;
  return GENERIC_TITLES.some((g) => v === g || v.startsWith(g));
}

export function parseHtml(html: string, finalUrl: string) {
  const metas = parseTags(html, "meta");
  const links = parseTags(html, "link");

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = clean(titleMatch?.[1] ?? null);

  const htmlTag = parseTags(html, "html")[0];
  const lang = clean(htmlTag?.attrs["lang"] ?? null);

  const canonicalTag = links.find((l) => (l.attrs["rel"] ?? "").toLowerCase().includes("canonical"));
  const canonical = absolute(finalUrl, clean(canonicalTag?.attrs["href"] ?? null));

  const iconTag =
    links.find((l) => (l.attrs["rel"] ?? "").toLowerCase().split(/\s+/).includes("icon")) ??
    links.find((l) => (l.attrs["rel"] ?? "").toLowerCase().includes("icon"));
  const favicon = absolute(finalUrl, clean(iconTag?.attrs["href"] ?? null));

  const robots = metaContent(metas, ["robots"], "name");
  const noindex = /noindex/i.test(robots ?? "");

  const h1Count = (html.match(/<h1\b[^>]*>/gi) ?? []).length;

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyHtml = bodyMatch?.[1] ?? "";
  const bodyText = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const description = metaContent(metas, ["description"], "name");

  return {
    title,
    description,
    canonical,
    robots,
    noindex,
    lang,
    favicon,
    h1Count,
    ogTitle: metaContent(metas, ["og:title"], "property"),
    ogDescription: metaContent(metas, ["og:description"], "property"),
    ogImage: absolute(finalUrl, metaContent(metas, ["og:image", "og:image:url", "og:image:secure_url"], "property")),
    ogUrl: metaContent(metas, ["og:url"], "property"),
    ogType: metaContent(metas, ["og:type"], "property"),
    twitterCard: metaContent(metas, ["twitter:card"], "name"),
    twitterTitle: metaContent(metas, ["twitter:title"], "name"),
    twitterImage: absolute(finalUrl, metaContent(metas, ["twitter:image", "twitter:image:src"], "name")),
    bodyTextLength: bodyText.length,
    emptyRootDiv: bodyText.length < 160,
  };
}

/* ---------------- server function ---------------- */

async function headCheck(url: string): Promise<ImageCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "image/*,*/*" },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": UA, accept: "image/*,*/*", range: "bytes=0-1024" },
      });
    }
    const len = res.headers.get("content-length");
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type"),
      bytes: len ? Number(len) : null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image request failed" };
  } finally {
    clearTimeout(timer);
  }
}

export const auditUrl = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ url: z.string().min(1).max(2048) }).parse(data))
  .handler(async ({ data }): Promise<AuditResponse> => {
    const validated = validateTargetUrl(data.url);
    if (!validated.ok) {
      return { ok: false, error: { code: validated.code, message: validated.message } };
    }
    const target = validated.url;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = Date.now();

    let res: Response;
    try {
      res = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
      return {
        ok: false,
        error: aborted
          ? { code: "timeout", message: "The page took longer than 8 seconds to answer. Sharing bots give up too." }
          : {
              code: "fetch_failed",
              message: "We couldn't reach that page. Check the address is public and live.",
            },
      };
    }

    const finalUrl = res.url || target.toString();
    const contentType = res.headers.get("content-type");

    // Read at most 2 MB
    let html = "";
    let bytes = 0;
    let truncated = false;
    try {
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder("utf-8");
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) {
            truncated = true;
            html += decoder.decode(value.slice(0, Math.max(0, value.byteLength - (bytes - MAX_BYTES))));
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            break;
          }
          html += decoder.decode(value, { stream: true });
        }
      } else {
        html = await res.text();
        bytes = html.length;
      }
    } catch {
      /* keep whatever we read */
    } finally {
      clearTimeout(timer);
    }

    const responseTimeMs = Date.now() - started;
    const parsed = parseHtml(html, finalUrl);

    const ogImageCheck = parsed.ogImage ? await headCheck(parsed.ogImage) : null;

    const spaTrap =
      parsed.emptyRootDiv &&
      (isGeneric(parsed.title) || !parsed.description) &&
      (!parsed.ogTitle || !parsed.ogDescription);

    const result: AuditData = {
      requestedUrl: target.toString(),
      finalUrl,
      redirected: finalUrl.replace(/\/$/, "") !== target.toString().replace(/\/$/, ""),
      status: res.status,
      responseTimeMs,
      contentType,
      ...parsed,
      ogImageCheck,
      htmlBytes: bytes,
      truncated,
      spaTrap,
    };

    return { ok: true, data: result };
  });
