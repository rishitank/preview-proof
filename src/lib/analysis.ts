import type { AuditData } from "./audit-types";

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

const GENERIC = /^(lovable app|lovable generated project|react app|vite \+ react|vite app|untitled|document|home|app|my app)$/i;

export function analyse(d: AuditData): Analysis {
  const fixes: Fix[] = [];
  const passed: string[] = [];
  const site = host(d.finalUrl);
  const pageTitle = d.title ?? d.ogTitle ?? `${site} — what it does, in a few words`;
  const pageDesc =
    d.description ?? d.ogDescription ?? `A one-sentence summary of what ${site} does and who it's for.`;

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
      severity: "critical",
      title: "Your tags are added by JavaScript, so sharing bots never see them",
      why: "X, LinkedIn, Slack and WhatsApp read the raw HTML and never run JavaScript. Right now they see an empty page, so every share looks like a bare link.",
      snippet: `<!-- Put real tags in the HTML the server sends -->
<title>${pageTitle}</title>
<meta name="description" content="${pageDesc}" />
<meta property="og:title" content="${pageTitle}" />
<meta property="og:description" content="${pageDesc}" />`,
      prompt: `My page's title, description and Open Graph tags are only set after JavaScript runs, so link previews and Google see an empty page. Move the metadata into the HTML that the server sends for each page, using the route's head() metadata, and give every page its own title, description, og:title, og:description and og:image.`,
    });
  } else if (d.bodyTextLength > 300) {
    passed.push("Real content is in the HTML before JavaScript runs");
  }

  /* ---- title ---- */
  if (!d.title || GENERIC.test(d.title)) {
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
      snippet: `<title>${d.title.slice(0, 57)}…</title>`,
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
      snippet: `<meta name="description" content="${pageDesc.slice(0, 155)}" />`,
      prompt: `Rewrite my meta description so it is between 120 and 155 characters, specific, and mentions what a visitor can do on the page.`,
    });
  } else {
    passed.push("Meta description is a good length");
  }

  /* ---- og image ---- */
  const imageBroken = d.ogImage && d.ogImageCheck && !d.ogImageCheck.ok;
  const imageHuge = d.ogImageCheck?.bytes != null && d.ogImageCheck.bytes > 5 * 1024 * 1024;
  if (!d.ogImage) {
    add({
      id: "og-image",
      severity: "critical",
      title: "No social preview image",
      why: "A link with a picture gets far more clicks than a bare blue link. Without og:image your app shows as a plain text row in every feed and chat.",
      snippet: `<meta property="og:image" content="https://${site}/preview.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:image" content="https://${site}/preview.jpg" />`,
      prompt: `Create a 1200x630 social share image for my app and add og:image and twitter:image tags pointing at its full https URL. Keep the file under 1 MB and make sure the image matches what the page actually shows.`,
    });
  } else if (imageBroken) {
    add({
      id: "og-image-broken",
      severity: "critical",
      title: "Your preview image doesn't load",
      why: `The image URL answers with ${d.ogImageCheck?.status ?? "an error"}, so every platform quietly drops the picture and shows a bare link instead.`,
      snippet: `<meta property="og:image" content="https://${site}/preview.jpg" />`,
      prompt: `My og:image URL (${d.ogImage}) does not load. Replace it with a working, publicly reachable 1200x630 image served over https, and check it opens in a private browser window.`,
    });
  } else if (imageHuge) {
    add({
      id: "og-image-size",
      severity: "important",
      title: "Preview image is very large",
      why: "WhatsApp skips images over about 600 KB and X and LinkedIn drop anything over 5 MB — the tag is there, but no picture appears.",
      snippet: `<!-- Export the same image at 1200x630 and compress it under 1 MB -->
<meta property="og:image" content="https://${site}/preview.jpg" />`,
      prompt: `My og:image is too heavy for chat apps to render. Produce a compressed 1200x630 version under 500 KB and point og:image and twitter:image at it.`,
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
<meta property="og:url" content="${d.finalUrl}" />`,
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
<meta name="twitter:image" content="${d.ogImage ?? `https://${site}/preview.jpg`}" />`,
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
      snippet: `<link rel="canonical" href="${d.finalUrl}" />`,
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
    passed.push("Favicon found");
  }

  const weights: Record<Severity, number> = { critical: 18, important: 8, nice: 3 };
  const penalty = fixes.reduce((sum, f) => sum + weights[f.severity], 0);
  const score = Math.max(5, Math.min(100, 100 - penalty));

  const order: Record<Severity, number> = { critical: 0, important: 1, nice: 2 };
  fixes.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score, fixes, passed };
}
