import { describe, expect, it } from "vitest";
import { perfectAudit } from "@/test/fixtures";
import { analyse, esc } from "./analysis";

const ids = (a: ReturnType<typeof analyse>) => a.fixes.map((f) => f.id);

describe("analyse", () => {
  it("gives a perfect page 100 with nothing to fix", () => {
    const a = analyse(perfectAudit());
    expect(a.score).toBe(100);
    expect(a.fixes).toEqual([]);
    expect(a.passed.length).toBeGreaterThan(8);
  });

  it.each([
    ["status", { status: 404 }, "critical"],
    ["slow", { responseTimeMs: 4200 }, "important"],
    ["spa", { spaTrap: true }, "critical"],
    ["title", { title: null }, "critical"],
    ["title", { title: "Lovable App" }, "critical"],
    ["title-long", { title: "x".repeat(80) }, "nice"],
    ["description", { description: null }, "critical"],
    ["description-length", { description: "Too short." }, "nice"],
    ["og-image", { ogImage: null, ogImageCheck: null }, "critical"],
    ["og-image-broken", { ogImageCheck: { ok: false, status: 404 } }, "critical"],
    ["og-image-broken", { ogImageCheck: { ok: false, error: "blocked" } }, "critical"],
    [
      "og-image-type",
      { ogImageCheck: { ok: true, status: 200, contentType: "text/html", bytes: 5000 } },
      "critical",
    ],
    ["og-image-relative", { ogImageRelative: true }, "important"],
    [
      "og-image-size",
      { ogImageCheck: { ok: true, status: 200, contentType: "image/png", bytes: 6_000_000 } },
      "important",
    ],
    [
      "og-image-heavy",
      { ogImageCheck: { ok: true, status: 200, contentType: "image/png", bytes: 700_000 } },
      "nice",
    ],
    ["og-text", { ogDescription: null }, "important"],
    ["twitter", { twitterCard: null }, "important"],
    ["twitter-small", { twitterCard: "summary" }, "nice"],
    ["noindex", { noindex: true }, "critical"],
    ["canonical", { canonical: null }, "nice"],
    ["h1", { h1Count: 0 }, "important"],
    ["h1-many", { h1Count: 3 }, "nice"],
    ["lang", { lang: null }, "nice"],
    ["favicon", { favicon: null, faviconDeclared: false }, "nice"],
  ] as const)("flags %s", (id, overrides, severity) => {
    const a = analyse(perfectAudit(overrides));
    const fix = a.fixes.find((f) => f.id === id);
    expect(fix, `expected fix ${id}; got ${ids(a).join(",")}`).toBeDefined();
    expect(fix!.severity).toBe(severity);
    expect(fix!.why.length).toBeGreaterThan(20);
    expect(fix!.prompt.length).toBeGreaterThan(20);
    expect(a.score).toBeLessThan(100);
  });

  it("does not double-report a broken image as heavy or relative", () => {
    const a = analyse(
      perfectAudit({
        ogImageRelative: true,
        ogImageCheck: { ok: false, status: 500, bytes: 9_000_000 },
      }),
    );
    expect(ids(a).filter((i) => i.startsWith("og-image"))).toEqual(["og-image-broken"]);
  });

  it("credits a default /favicon.ico", () => {
    const a = analyse(
      perfectAudit({ favicon: "https://acme.example/favicon.ico", faviconDeclared: false }),
    );
    expect(ids(a)).not.toContain("favicon");
    expect(a.passed).toContain("Favicon found at /favicon.ico");
  });

  it("orders fixes critical, then important, then nice", () => {
    const a = analyse(perfectAudit({ lang: null, twitterCard: null, title: null }));
    expect(a.fixes.map((f) => f.severity)).toEqual(["critical", "important", "nice"]);
  });

  it("never scores below 5 however bad the page is", () => {
    const a = analyse(
      perfectAudit({
        status: 500,
        spaTrap: true,
        title: null,
        description: null,
        ogImage: null,
        ogImageCheck: null,
        ogTitle: null,
        ogDescription: null,
        twitterCard: null,
        noindex: true,
        canonical: null,
        h1Count: 0,
        lang: null,
        favicon: null,
        responseTimeMs: 9000,
      }),
    );
    expect(a.score).toBe(5);
  });

  it("escapes page text so every snippet is valid, safe HTML to paste", () => {
    const hostile = `Tom's "Best" <script>alert(1)</script> & Co`;
    const a = analyse(
      perfectAudit({
        title: hostile,
        description: null,
        ogTitle: null,
        ogDescription: null,
        h1Count: 0,
      }),
    );
    for (const fix of a.fixes) {
      expect(fix.snippet).not.toContain("<script>");
      expect(fix.snippet).not.toMatch(/content="[^"]*"[^ />\n]/); // no attribute broken open by a quote
    }
    const h1 = a.fixes.find((f) => f.id === "h1")!;
    expect(h1.snippet).toBe(
      "<h1>Tom's &quot;Best&quot; &lt;script&gt;alert(1)&lt;/script&gt; &amp; Co</h1>",
    );
  });

  it("does not suggest a placeholder title back to the user", () => {
    const a = analyse(perfectAudit({ title: "Lovable App", ogTitle: null }));
    const fix = a.fixes.find((f) => f.id === "title")!;
    expect(fix.snippet).not.toContain("Lovable App");
    expect(fix.snippet).toContain("acme.example");
  });

  it("uses an absolute image URL in snippets even when the page's og:image is relative", () => {
    const a = analyse(
      perfectAudit({ ogImage: "https://acme.example/og.png", ogImageRelative: true }),
    );
    const fix = a.fixes.find((f) => f.id === "og-image-relative")!;
    expect(fix.snippet).toContain('content="https://acme.example/og-image.png"');
  });
});

describe("esc", () => {
  it("escapes the four characters that break HTML", () => {
    expect(esc(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});
