import type { AuditData } from "@/lib/audit-types";

/** A page that passes every check. Tests override one field at a time. */
export function perfectAudit(overrides: Partial<AuditData> = {}): AuditData {
  return {
    requestedUrl: "https://acme.example/",
    finalUrl: "https://acme.example/",
    redirected: false,
    status: 200,
    responseTimeMs: 180,
    contentType: "text/html; charset=utf-8",
    title: "Acme: invoices in one click",
    description:
      "Acme turns timesheets into invoices automatically, so freelancers get paid faster and never chase a client again.",
    canonical: "https://acme.example/",
    robots: null,
    noindex: false,
    lang: "en",
    favicon: "https://acme.example/favicon.svg",
    faviconDeclared: true,
    h1Count: 1,
    ogTitle: "Acme",
    ogDescription: "Invoices in one click",
    ogImage: "https://acme.example/og.png",
    ogImageRelative: false,
    ogUrl: "https://acme.example/",
    ogType: "website",
    twitterCard: "summary_large_image",
    twitterTitle: null,
    twitterDescription: null,
    twitterImage: null,
    ogImageCheck: { ok: true, status: 200, contentType: "image/png", bytes: 120_000 },
    bodyTextLength: 900,
    emptyRootDiv: false,
    spaTrap: false,
    builtWithLovable: false,
    ogImageIsPlaceholder: false,
    htmlBytes: 12_000,
    truncated: false,
    ...overrides,
  };
}
