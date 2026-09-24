import { describe, expect, it } from "vitest";
import {
  absoluteHttpUrl,
  decodeBody,
  decodeEntities,
  detectCharset,
  isBotChallenge,
  isGenericTitle,
  looksLikeHtml,
  parseHtml,
} from "./html";

const BASE = "https://app.example.com/pricing";

const page = (
  head: string,
  body = "<main><h1>Hello</h1><p>Plenty of real server-rendered text.</p></main>",
) => `<!doctype html><html lang="en-GB"><head>${head}</head><body>${body}</body></html>`;

describe("parseHtml", () => {
  it('keeps tags whose attribute values contain ">"', () => {
    const d = parseHtml(
      page(`<meta name="description" content="Idea -> app in minutes">
        <meta property="og:title" content='Fast > slow'>`),
      BASE,
    );
    expect(d.description).toBe("Idea -> app in minutes");
    expect(d.ogTitle).toBe("Fast > slow");
  });

  it("skips an empty og:image and uses the next candidate, as platforms do", () => {
    const d = parseHtml(
      page(`<meta property="og:image" content="">
        <meta property="og:image:secure_url" content="https://cdn.example.com/og.png">`),
      BASE,
    );
    expect(d.ogImage).toBe("https://cdn.example.com/og.png");
  });

  it("reads twitter:description", () => {
    const d = parseHtml(page(`<meta name="twitter:description" content="On X">`), BASE);
    expect(d.twitterDescription).toBe("On X");
  });

  it("without </head>, ignores an SVG <title> in the body", () => {
    const d = parseHtml(
      '<html><head><meta charset="utf-8"><body><svg><title>Icon</title></svg><h1>Hi</h1></body></html>',
      BASE,
    );
    expect(d.title).toBeNull();
  });

  it("accepts an inline data: image favicon but not other data: URLs", () => {
    expect(
      parseHtml(page(`<link rel="icon" href="data:image/svg+xml,%3Csvg%3E">`), BASE).favicon,
    ).toBe("data:image/svg+xml,%3Csvg%3E");
    expect(parseHtml(page(`<link rel="icon" href="data:text/html,x">`), BASE).favicon).toBeNull();
  });

  it("extracts every tag a preview bot reads", () => {
    const d = parseHtml(
      page(`
        <title>Acme &amp; Co — Pricing</title>
        <meta name="description" content="Simple plans &quot;for&quot; teams">
        <link rel="canonical" href="/pricing">
        <link rel="icon" href="/icon.png">
        <meta name="robots" content="index,follow">
        <meta property="og:title" content="Acme pricing">
        <meta property="og:description" content="Plans">
        <meta property="og:image" content="https://cdn.example.com/og.png">
        <meta property="og:url" content="https://app.example.com/pricing">
        <meta property="og:type" content="website">
        <meta name="twitter:card" content="SUMMARY_LARGE_IMAGE">
        <meta name="twitter:title" content="Acme on X">
        <meta name="twitter:image" content="/tw.png">`),
      BASE,
    );
    expect(d).toMatchObject({
      title: "Acme & Co — Pricing",
      description: 'Simple plans "for" teams',
      canonical: "https://app.example.com/pricing",
      favicon: "https://app.example.com/icon.png",
      noindex: false,
      lang: "en-GB",
      h1Count: 1,
      ogTitle: "Acme pricing",
      ogDescription: "Plans",
      ogImage: "https://cdn.example.com/og.png",
      ogImageRelative: false,
      ogUrl: "https://app.example.com/pricing",
      ogType: "website",
      twitterCard: "summary_large_image",
      twitterTitle: "Acme on X",
      twitterImage: "https://app.example.com/tw.png",
    });
  });

  it("returns nulls, not crashes, for an empty or junk document", () => {
    for (const html of [
      "",
      "not html at all",
      "<html><head></head><body></body></html>",
      "<<<>>>",
    ]) {
      const d = parseHtml(html, BASE);
      expect(d.title).toBeNull();
      expect(d.ogImage).toBeNull();
      expect(d.h1Count).toBe(0);
      expect(d.emptyRootDiv).toBe(false); // no script bundle, so not a JS shell
    }
  });

  it("ignores tags inside comments, scripts, styles and templates", () => {
    const d = parseHtml(
      page(
        `<!-- <meta property="og:image" content="https://evil.example/x.png"> -->
         <script>document.write('<title>From JS</title><meta name="description" content="js">')</script>
         <style>/* <meta property="og:title" content="css"> */</style>
         <template><meta property="og:title" content="tpl"></template>
         <title>Real</title>`,
        `<script>const h = "<h1>not real</h1>"</script><h1>One</h1>`,
      ),
      BASE,
    );
    expect(d.title).toBe("Real");
    expect(d.description).toBeNull();
    expect(d.ogImage).toBeNull();
    expect(d.ogTitle).toBeNull();
    expect(d.h1Count).toBe(1);
  });

  it("reads the document title, not an SVG <title> in the body", () => {
    const d = parseHtml(page("", `<svg><title>Icon</title></svg><h1>x</h1>`), BASE);
    expect(d.title).toBeNull();
  });

  it("accepts name/property swapped, single quotes, unquoted and upper-case attributes", () => {
    const d = parseHtml(
      page(
        `<META NAME='og:title' CONTENT='Swapped'><meta content=Unquoted name=description><meta property="twitter:card" content="summary">`,
      ),
      BASE,
    );
    expect(d.ogTitle).toBe("Swapped");
    expect(d.description).toBe("Unquoted");
    expect(d.twitterCard).toBe("summary");
  });

  it("flags relative og:image and drops non-http schemes", () => {
    expect(parseHtml(page(`<meta property="og:image" content="/og.png">`), BASE)).toMatchObject({
      ogImage: "https://app.example.com/og.png",
      ogImageRelative: true,
    });
    expect(
      parseHtml(page(`<meta property="og:image" content="javascript:alert(1)">`), BASE).ogImage,
    ).toBeNull();
    expect(
      parseHtml(page(`<meta property="og:image" content="data:image/png;base64,AAAA">`), BASE)
        .ogImage,
    ).toBeNull();
  });

  it("detects noindex from robots meta, including 'none'", () => {
    expect(parseHtml(page(`<meta name="robots" content="noindex, nofollow">`), BASE).noindex).toBe(
      true,
    );
    expect(parseHtml(page(`<meta name="robots" content="none">`), BASE).noindex).toBe(true);
    expect(parseHtml(page(`<meta name="robots" content="index">`), BASE).noindex).toBe(false);
  });

  it("marks a client-rendered shell as an empty root div", () => {
    const spa = parseHtml(
      `<!doctype html><html><head><title>Vite + React + TS</title></head><body><div id="root"></div><noscript>You need to enable JavaScript to run this app with a long explanation that should not count as content because bots treat it as fallback text only.</noscript><script type="module" src="/main.js"></script></body></html>`,
      BASE,
    );
    expect(spa.emptyRootDiv).toBe(true);
    expect(isGenericTitle(spa.title)).toBe(true);
  });

  it("counts every h1 and treats apple-touch-icon as a favicon fallback", () => {
    const d = parseHtml(
      page(`<link rel="apple-touch-icon" href="/apple.png">`, "<h1>a</h1><H1 class=x>b</H1>"),
      BASE,
    );
    expect(d.h1Count).toBe(2);
    expect(d.favicon).toBe("https://app.example.com/apple.png");
  });
});

describe("client-rendered shell detection", () => {
  it("does not treat a short static page as a JavaScript shell", () => {
    const exampleDotCom = `<!doctype html><html><head><title>Example Domain</title></head><body><div><h1>Example Domain</h1><p>This domain is for use in documentation examples.</p></div></body></html>`;
    expect(parseHtml(exampleDotCom, BASE).emptyRootDiv).toBe(false);
  });

  it.each([
    `<div id="root"></div><script type="module" src="/src/main.tsx"></script>`,
    `<div id="app">  </div><script src="/assets/index-abc.js"></script>`,
    `<div id=__next></div><script src="/_next/static/chunks/main.js" defer></script>`,
    `<script type="module" crossorigin src="/assets/app.js"></script>`,
  ])("detects a shell: %s", (body) => {
    expect(
      parseHtml(`<html><head><title>x</title></head><body>${body}</body></html>`, BASE)
        .emptyRootDiv,
    ).toBe(true);
  });

  it("does not flag a server-rendered app that also ships a bundle", () => {
    const ssr = `<html><head></head><body><div id="root"><main><h1>Pricing</h1><p>${"Real text. ".repeat(30)}</p></main></div><script type="module" src="/a.js"></script></body></html>`;
    expect(parseHtml(ssr, BASE).emptyRootDiv).toBe(false);
  });
});

describe("builder fingerprints", () => {
  it("recognises Lovable's legacy template and its stock share image", () => {
    const d = parseHtml(
      `<html><head><meta name="author" content="Lovable"><meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
      "https://my-app.example/",
    );
    expect(d.builtWithLovable).toBe(true);
    expect(d.ogImageIsPlaceholder).toBe(true);
  });

  it("recognises a lovable.app host and leaves other sites alone", () => {
    expect(parseHtml("<html></html>", "https://cool-thing.lovable.app/").builtWithLovable).toBe(
      true,
    );
    expect(parseHtml("<html></html>", "https://acme.example/").builtWithLovable).toBe(false);
  });
});

describe("isGenericTitle", () => {
  it.each(["Lovable App", "  vite + react + ts ", "React App", "Untitled", "index"])(
    "flags %j",
    (t) => expect(isGenericTitle(t)).toBe(true),
  );
  it.each(["Figma", "Stripe", "Acme — Pricing", "Home Depot deals"])("keeps real title %j", (t) =>
    expect(isGenericTitle(t)).toBe(false),
  );
  it("treats a missing title as generic", () => expect(isGenericTitle(null)).toBe(true));
});

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities and leaves unknown ones alone", () => {
    expect(decodeEntities("&amp;&lt;&gt;&quot;&#39;&#x27;&nbsp;&mdash;&#128640;&bogus;")).toBe(
      "&<>\"''\u00a0—🚀&bogus;",
    );
  });

  it("decodes every HTML 4 named entity, case-sensitively", () => {
    expect(decodeEntities("Caf&eacute; &Eacute;cole &euro;5 &frac12; &hearts; &apos;")).toBe(
      "Café École €5 ½ ♥ '",
    );
  });

  it("turns NUL, surrogates and out-of-range code points into U+FFFD, like browsers", () => {
    expect(decodeEntities("a&#0;b&#xD800;c&#99999999;")).toBe("a\uFFFDb\uFFFDc\uFFFD");
  });
});

describe("absoluteHttpUrl", () => {
  it("resolves relative paths and rejects other schemes", () => {
    expect(absoluteHttpUrl(BASE, "../a.png")).toBe("https://app.example.com/a.png");
    expect(absoluteHttpUrl(BASE, "//cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(absoluteHttpUrl(BASE, "mailto:x@y.z")).toBeNull();
    expect(absoluteHttpUrl(BASE, null)).toBeNull();
  });
});

describe("charset handling", () => {
  it("prefers the Content-Type charset, then <meta charset>, then UTF-8", () => {
    const bytes = new TextEncoder().encode('<meta charset="windows-1252">');
    expect(detectCharset("text/html; charset=ISO-8859-1", bytes)).toBe("iso-8859-1");
    expect(detectCharset("text/html", bytes)).toBe("windows-1252");
    expect(detectCharset(null, new TextEncoder().encode("<html>"))).toBe("utf-8");
    expect(
      detectCharset(
        null,
        new TextEncoder().encode(
          '<meta http-equiv="Content-Type" content="text/html; charset=shift_jis">',
        ),
      ),
    ).toBe("shift_jis");
  });

  it("decodes a Latin-1 page correctly instead of producing mojibake", () => {
    const latin1 = Uint8Array.from(
      [..."<title>Caf"]
        .map((c) => c.charCodeAt(0))
        .concat(
          [0xe9],
          [..."</title>"].map((c) => c.charCodeAt(0)),
        ),
    );
    expect(decodeBody(latin1, "text/html; charset=iso-8859-1")).toBe("<title>Café</title>");
  });

  it("falls back to UTF-8 for an unknown label", () => {
    expect(decodeBody(new TextEncoder().encode("héllo"), "text/html; charset=made-up")).toBe(
      "héllo",
    );
  });
});

describe("looksLikeHtml", () => {
  it.each([
    ["text/html; charset=utf-8", ""],
    ["application/xhtml+xml", ""],
    [null, "<!DOCTYPE html><html>"],
    ["text/plain", "  <html><head>"],
  ])("accepts %s", (ct, body) => expect(looksLikeHtml(ct, body)).toBe(true));

  it.each([
    ["image/png", "\x89PNG"],
    ["application/json", '{"a":1}'],
    ["application/pdf", "%PDF-1.7"],
    [null, "just some text"],
  ])("rejects %s", (ct, body) => expect(looksLikeHtml(ct, body)).toBe(false));
});

describe("byte-order marks and bot challenges", () => {
  it("honours a UTF-16 byte-order mark over the declared charset", () => {
    const text = "<title>Hi</title>";
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) bytes[2 + i * 2] = text.charCodeAt(i);
    expect(decodeBody(bytes, "text/html; charset=utf-8")).toBe(text);
  });

  it("recognises a challenge title that carries attributes", () => {
    expect(isBotChallenge(403, new Headers(), '<title data-x="1">Just a moment...</title>')).toBe(
      true,
    );
  });
});
