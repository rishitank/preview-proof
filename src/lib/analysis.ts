import type { AuditData } from "./audit-types";
import { isGenericTitle } from "./html";

export type Severity = "critical" | "important" | "nice";

export type Fix = {
  id: string;
  severity: Severity;
  title: string;
  why: string;
  snippet: string;
  prompt: string;
};

export type Analysis = {
  score: number;
  fixes: Fix[];
  passed: string[];
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Escapes text for use inside an HTML attribute value or element body in a copy-paste snippet. */
export function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function analyse(d: AuditData): Analysis {
  const fixes: Fix[] = [];
  const passed: string[] = [];
  const site = host(d.finalUrl);
  const pageTitle = esc(
    (!isGenericTitle(d.title) ? d.title : null) ??
      (!isGenericTitle(d.ogTitle) ? d.ogTitle : null) ??
      `${site}: what it does, in a few words`,
  );
  const pageDesc = esc(
    d.description ??
      d.ogDescription ??
      `A one-sentence summary of what ${site} does and who it's for.`,
  );
  const origin = (() => {
    try {
      return new URL(d.finalUrl).origin;
    } catch {
      return `https://${site}`;
    }
  })();
  const imageUrl = esc(d.ogImage && !d.ogImageRelative ? d.ogImage : `${origin}/og-image.png`);

  const add = (f: Fix) => fixes.push(f);

  /* ---- status / speed ---- */
  if (d.status >= 400) {
    add({
      id: "status",
      severity: "critical",
      title: `The page answers with an error (${d.status})`,
      why: "Google won't index a page that returns an error, and every share link will show a blank or broken preview.",
      snippet: `<!-- Nothing to paste here: the page itself must return 200 OK.\n     Check the URL is published and the route exists. -->`,
      prompt: `My page ${d.finalUrl} returns HTTP ${d.status}. Find out why that route fails and make it return a real page with a 200 status.`,
    });
  } else {
    passed.push(`Page loads fine (${d.status})`);
  }

  if (d.responseTimeMs > 3000) {
    add({
      id: "slow",
      severity: "important",
      title: `Slow first response (${(d.responseTimeMs / 1000).toFixed(1)}s)`,
      why: "Preview bots on Slack, WhatsApp and X wait only a couple of seconds. Slow pages silently lose their preview card.",
      snippet: `<!-- Speed comes from the page itself, not a tag.\n     Serve pre-rendered HTML and compress large images. -->`,
      prompt: `${d.finalUrl} takes ${(d.responseTimeMs / 1000).toFixed(1)} seconds to return HTML. Find the slowest work happening before the first byte and make the page respond in under one second.`,
    });
  } else {
    passed.push(`Fast response (${d.responseTimeMs} ms)`);
  }

  /* ---- SPA trap ---- */
  if (d.spaTrap) {
    add({
      id: "spa",
      severity: d.builtWithLovable ? "important" : "critical",
      title: "Your page is an empty shell until JavaScript runs",
      why: d.builtWithLovable
        ? "The HTML your server sends has no real title, description or content. Lovable pre-renders older apps for verified crawlers, so Google and the big networks may still be fine, but every other link unfurler, SEO tool and AI agent sees a blank page."
        : "X, LinkedIn, Slack and WhatsApp read the raw HTML and never run JavaScript. Right now they see an empty page, so every share looks like a bare link.",
      snippet: `<!-- Put real tags in the HTML the server sends -->
<title>${pageTitle}</title>
<meta name="description" content="${pageDesc}" />
<meta property="og:title" content="${pageTitle}" />
<meta property="og:description" content="${pageDesc}" />`,
      prompt: d.builtWithLovable
        ? `Upgrade this project to TanStack Start so every page is server-side rendered. Then give each route its own head() metadata: title, description, og:title, og:description, og:image (absolute https URL) and twitter:card set to summary_large_image.`
        : `My page's title, description and Open Graph tags are only set after JavaScript runs, so link previews and Google see an empty page. Move the metadata into the HTML that the server sends for each page, using the route's head() metadata, and give every page its own title, description, og:title, og:description and og:image.`,
    });
  } else if (d.bodyTextLength > 300) {
    passed.push("Real content is in the HTML before JavaScript runs");
  }

  /* ---- title ---- */
  if (!d.title || isGenericTitle(d.title)) {
    add({
      id: "title",
      severity: "critical",
      title: d.title ? `Placeholder title: "${d.title}"` : "No page title",
      why: "The title is the blue link in Google and the bold line in every share card. A default title tells nobody what your app does, so people scroll past it.",
      snippet: `<title>${pageTitle}</title>`,
      prompt: `Give my page a real title instead of a placeholder. Write a specific title under 60 characters that says what the app does, and set it as the page title plus og:title and twitter:title.`,
    });
  } else if (d.title.length > 60) {
    add({
      id: "title-long",
      severity: "nice",
      title: `Title is long (${d.title.length} characters)`,
      why: "Google cuts titles off around 60 characters, so the end of your message disappears mid-sentence.",
      snippet: `<title>${esc(d.title.slice(0, 57))}…</title>`,
      prompt: `Shorten my page title to under 60 characters while keeping the most important words first.`,
    });
  } else {
    passed.push("Clear, well-sized page title");
  }

  /* ---- description ---- */
  if (!d.description) {
    add({
      id: "description",
      severity: "critical",
      title: "No meta description",
      why: "This is the grey text under your Google result and the subtitle in most share cards. Without it, search engines guess — usually badly.",
      snippet: `<meta name="description" content="${pageDesc}" />`,
      prompt: `Add a meta description to my page: one clear sentence of 120-155 characters explaining what the app does and who it helps. Use the same text for og:description.`,
    });
  } else if (d.description.length < 70 || d.description.length > 160) {
    add({
      id: "description-length",
      severity: "nice",
      title: `Description is ${d.description.length < 70 ? "very short" : "too long"} (${d.description.length} characters)`,
      why: "Aim for 120-155 characters. Shorter wastes the space; longer gets cut off with an ellipsis.",
      snippet: `<meta name="description" content="${esc((d.description ?? "").slice(0, 155))}" />`,
      prompt: `Rewrite my meta description so it is between 120 and 155 characters, specific, and mentions what a visitor can do on the page.`,
    });
  } else {
    passed.push("Meta description is a good length");
  }

  /* ---- og image ---- */
  const check = d.ogImageCheck;
  const imageBroken = !!d.ogImage && !!check && !check.ok;
  const imageWrongType =
    !!check?.ok && !!check.contentType && !check.contentType.toLowerCase().startsWith("image/");
  const imageHuge = check?.bytes != null && check.bytes > 5 * 1024 * 1024;
  const imageHeavy = check?.bytes != null && check.bytes > 600 * 1024;
  const imageTags = `<meta property="og:image" content="${imageUrl}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:image" content="${imageUrl}" />`;
  if (!d.ogImage) {
    add({
      id: "og-image",
      severity: "critical",
      title: "No social preview image",
      why: "A link with a picture gets far more clicks than a bare blue link. Without og:image your app shows as a plain text row in every feed and chat.",
      snippet: imageTags,
      prompt: `Create a 1200x630 social share image for my app and add og:image and twitter:image tags pointing at its full https URL. Keep the file under 600 KB and make sure the image matches what the page actually shows.`,
    });
  } else if (imageBroken) {
    const reason =
      check?.error === "blocked"
        ? "points at an address that isn't public"
        : check?.status
          ? `answers with HTTP ${check.status}`
          : "can't be reached";
    add({
      id: "og-image-broken",
      severity: "critical",
      title: "Your preview image doesn't load",
      why: `The image URL ${reason}, so every platform quietly drops the picture and shows a bare link instead.`,
      snippet: imageTags,
      prompt: `My og:image URL (${d.ogImage}) does not load. Replace it with a working, publicly reachable 1200x630 image served over https, and check it opens in a private browser window.`,
    });
  } else if (d.ogImageIsPlaceholder) {
    add({
      id: "og-image-placeholder",
      severity: "important",
      title: "Your preview image is the template's stock image",
      why: "Every app built from the same template shares this picture, so your link looks like everyone else's and says nothing about your product.",
      snippet: imageTags,
      prompt: `My og:image still points at the template's default image. Create a 1200x630 share image for this app that shows its name and what it does, save it in public/, and point og:image and twitter:image at its full https URL.`,
    });
  } else if (imageWrongType) {
    add({
      id: "og-image-type",
      severity: "critical",
      title: "Your preview image URL isn't an image",
      why: `It returns ${check?.contentType?.split(";")[0]} instead of an image, so platforms can't show a picture.`,
      snippet: imageTags,
      prompt: `My og:image URL (${d.ogImage}) returns a web page instead of an image file. Point og:image and twitter:image at the actual image file (PNG or JPG, 1200x630) using its full https URL.`,
    });
  } else if (d.ogImageRelative) {
    add({
      id: "og-image-relative",
      severity: "important",
      title: "Preview image uses a relative URL",
      why: "Facebook, LinkedIn and several chat apps only accept a full https:// address in og:image. A relative path often means no picture.",
      snippet: imageTags,
      prompt: `My og:image and twitter:image tags use a relative path. Change them to the full absolute https URL of the image.`,
    });
  } else if (imageHuge) {
    add({
      id: "og-image-size",
      severity: "important",
      title: "Preview image is very large",
      why: "X and LinkedIn drop images over 5 MB and WhatsApp skips anything over about 600 KB, so the tag is there but no picture appears.",
      snippet: `<!-- Export the same image at 1200x630 and compress it under 600 KB -->\n${imageTags}`,
      prompt: `My og:image is too heavy for chat apps to render. Produce a compressed 1200x630 version under 600 KB and point og:image and twitter:image at it.`,
    });
  } else if (imageHeavy) {
    add({
      id: "og-image-heavy",
      severity: "nice",
      title: "Preview image is heavy for WhatsApp",
      why: "WhatsApp tends to skip preview images over about 600 KB and sends a plain link instead.",
      snippet: `<!-- Compress the same 1200x630 image under 600 KB -->\n${imageTags}`,
      prompt: `Compress my og:image to under 600 KB at 1200x630 so WhatsApp shows it.`,
    });
  } else {
    passed.push("Social preview image loads");
  }

  /* ---- og title / description ---- */
  if (!d.ogTitle || !d.ogDescription) {
    add({
      id: "og-text",
      severity: "important",
      title: "Missing Open Graph title or description",
      why: "LinkedIn, Slack, WhatsApp and Facebook read og: tags first. Without them they fall back to whatever they can scrape, which is often the wrong text.",
      snippet: `<meta property="og:title" content="${pageTitle}" />
<meta property="og:description" content="${pageDesc}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(d.finalUrl)}" />`,
      prompt: `Add complete Open Graph tags to my page: og:title, og:description, og:type and og:url, matching the page's real title and description.`,
    });
  } else {
    passed.push("Open Graph title and description present");
  }

  /* ---- twitter card ---- */
  if (!d.twitterCard) {
    add({
      id: "twitter",
      severity: "important",
      title: "No Twitter/X card type",
      why: "Without twitter:card, X shows a small thumbnail or no image at all instead of the big edge-to-edge picture that stops the scroll.",
      snippet: `<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${pageTitle}" />
<meta name="twitter:image" content="${imageUrl}" />`,
      prompt: `Add X (Twitter) card tags to my page: twitter:card set to summary_large_image, plus twitter:title, twitter:description and twitter:image.`,
    });
  } else if (d.twitterCard !== "summary_large_image" && d.ogImage) {
    add({
      id: "twitter-small",
      severity: "nice",
      title: `Card type is "${d.twitterCard}" — the small one`,
      why: "You already have an image; summary_large_image shows it full width on X and gets noticeably more clicks.",
      snippet: `<meta name="twitter:card" content="summary_large_image" />`,
      prompt: `Change my twitter:card tag to summary_large_image so X shows the big preview image.`,
    });
  } else {
    passed.push("X card set to the large image format");
  }

  /* ---- noindex ---- */
  if (d.noindex) {
    add({
      id: "noindex",
      severity: "critical",
      title: "This page tells Google not to index it",
      why: 'A "noindex" instruction keeps the page out of search results entirely, no matter how good everything else is.',
      snippet: `<!-- Remove the noindex tag, or replace it with: -->
<meta name="robots" content="index, follow" />`,
      prompt: `My page has a robots meta tag with noindex, which hides it from Google. Remove it from the pages that should be public and keep it only on private pages.`,
    });
  } else {
    passed.push("Search engines are allowed to index the page");
  }

  /* ---- canonical ---- */
  if (!d.canonical) {
    add({
      id: "canonical",
      severity: "nice",
      title: "No canonical link",
      why: "A canonical tag tells Google which address is the real one, so shares with tracking codes don't split your ranking across duplicates.",
      snippet: `<link rel="canonical" href="${esc(d.finalUrl)}" />`,
      prompt: `Add a self-referencing canonical link to every page so search engines know the preferred URL.`,
    });
  } else {
    passed.push("Canonical URL is set");
  }

  /* ---- h1 ---- */
  if (d.h1Count === 0) {
    add({
      id: "h1",
      severity: "important",
      title: "No main heading in the HTML",
      why: "The H1 is the strongest on-page clue about your topic, and it's what people read first when they land.",
      snippet: `<h1>${pageTitle}</h1>`,
      prompt: `Add exactly one clear H1 heading to the page that states what the app does, and make sure it is in the server-rendered HTML.`,
    });
  } else if (d.h1Count > 1) {
    add({
      id: "h1-many",
      severity: "nice",
      title: `${d.h1Count} main headings on one page`,
      why: "Several H1s blur the page's topic. Keep one, and demote the rest to H2.",
      snippet: `<h1>${pageTitle}</h1>
<h2>Supporting section heading</h2>`,
      prompt: `My page has ${d.h1Count} H1 headings. Keep the most important one as H1 and change the others to H2.`,
    });
  } else {
    passed.push("Exactly one main heading");
  }

  /* ---- lang ---- */
  if (!d.lang) {
    add({
      id: "lang",
      severity: "nice",
      title: "No language set on the page",
      why: "Search engines and screen readers use this to decide who to show the page to and how to pronounce it.",
      snippet: `<html lang="en">`,
      prompt: `Set the lang attribute on the html element to the language the page is written in.`,
    });
  } else {
    passed.push(`Language declared (${d.lang})`);
  }

  /* ---- favicon ---- */
  if (!d.favicon) {
    add({
      id: "favicon",
      severity: "nice",
      title: "No favicon",
      why: "Google shows a little icon next to your result on mobile, and Slack shows it in unfurls. A blank globe looks unfinished.",
      snippet: `<link rel="icon" href="/favicon.ico" type="image/x-icon" />`,
      prompt: `Create a simple favicon that matches my brand and link it from the page head.`,
    });
  } else {
    passed.push(d.faviconDeclared ? "Favicon found" : "Favicon found at /favicon.ico");
  }

  const weights: Record<Severity, number> = { critical: 18, important: 8, nice: 3 };
  const penalty = fixes.reduce((sum, f) => sum + weights[f.severity], 0);
  const score = Math.max(5, Math.min(100, 100 - penalty));

  const order: Record<Severity, number> = { critical: 0, important: 1, nice: 2 };
  fixes.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score, fixes, passed };
}
