import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, RefreshCw, ShieldAlert, Clock, Link2Off, Search } from "lucide-react";

import { auditUrl } from "@/lib/audit.functions";
import { analyse } from "@/lib/analysis";
import type { AuditResponse } from "@/lib/audit-types";
import { PreviewCards } from "@/components/PreviewCards";
import { OG_IMAGE_URL, SITE_URL } from "@/lib/site";
import { FixList } from "@/components/FixList";
import { ScoreRing } from "@/components/ScoreRing";

const TITLE = "PreviewProof — see how your app looks when people share it";
const DESCRIPTION =
  "Paste a public URL and see the exact Google, X, LinkedIn, Slack and WhatsApp previews your app produces today, what's broken, and copy-paste fixes.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: OG_IMAGE_URL },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "PreviewProof: see your link the way the internet sees it",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE_URL },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "PreviewProof",
          url: `${SITE_URL}/`,
          applicationCategory: "DeveloperApplication",
          description: DESCRIPTION,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: Index,
});

const ERROR_ICONS = {
  invalid_url: Link2Off,
  blocked_host: ShieldAlert,
  blocked_port: ShieldAlert,
  timeout: Clock,
  fetch_failed: Link2Off,
  not_html: Link2Off,
} as const;

function Index() {
  const [url, setUrl] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);
  const run = useServerFn(auditUrl);

  const mutation = useMutation<AuditResponse, Error, string>({
    mutationFn: (value: string) => run({ data: { url: value } }),
  });

  const result = mutation.data;
  const analysis = useMemo(() => (result?.ok ? analyse(result.data) : null), [result]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read the live field value, not just React state: text typed before hydration never fired onChange.
    const value = String(new FormData(e.currentTarget).get("url") ?? url).trim();
    if (value !== url) setUrl(value);
    if (!value || mutation.isPending) return;
    mutation.mutate(value);
  };

  // Move focus to the outcome so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (mutation.isSuccess || mutation.isError) resultsRef.current?.focus();
  }, [mutation.isSuccess, mutation.isError, mutation.submittedAt]);

  const verdict =
    analysis == null
      ? ""
      : analysis.score >= 85
        ? "Your link looks great wherever it lands."
        : analysis.score >= 60
          ? "Decent, but sharers are seeing less than they should."
          : "Right now most shares of your app look broken or blank.";

  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-3xl px-4 pb-14 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
            <Search className="size-3.5 text-primary" />
            Built for apps that deserve to spread
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-6xl">
            See your link the way
            <span className="block bg-gradient-brand bg-clip-text text-transparent">
              the internet sees it
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Paste a public URL. We'll fetch it exactly like a sharing bot does — no JavaScript — and
            show you the real previews, plus how to fix what's missing.
          </p>

          <form onSubmit={submit} className="mx-auto mt-8 max-w-xl">
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-2 shadow-lift sm:flex-row">
              <input
                type="text"
                name="url"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="yourapp.lovable.app"
                aria-label="Public URL to check"
                className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={mutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-5 py-3 text-base font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Checking…
                  </>
                ) : (
                  <>
                    Check my app <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Public pages only. Nothing is stored.
            </p>
          </form>
        </div>
      </section>

      <div
        ref={resultsRef}
        tabIndex={-1}
        aria-live="polite"
        aria-busy={mutation.isPending}
        className="mx-auto max-w-5xl px-4 pb-24 outline-none"
      >
        {/* Loading */}
        {mutation.isPending ? (
          <div className="surface-card mt-2 p-6">
            <div className="flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-primary" />
              <p className="font-display font-semibold">
                Fetching your page like a link-preview bot…
              </p>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse space-y-3 rounded-xl border border-border p-4"
                >
                  <div className="h-28 rounded-lg bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Request-level failure */}
        {mutation.isError ? (
          <div className="surface-card mt-2 border-destructive/40 p-6">
            <h2 className="font-display text-lg font-bold text-destructive">
              Something went wrong
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We couldn't finish the check. Please try again in a moment.
            </p>
          </div>
        ) : null}

        {/* Handled error */}
        {result && !result.ok
          ? (() => {
              const Icon = ERROR_ICONS[result.error.code] ?? Link2Off;
              return (
                <div className="surface-card mt-2 border-destructive/40 p-6">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-destructive" />
                    <div>
                      <h2 className="font-display text-lg font-bold">
                        We couldn't check that link
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">{result.error.message}</p>
                      <button
                        type="button"
                        onClick={() => mutation.variables && mutation.mutate(mutation.variables)}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                      >
                        <RefreshCw className="size-4" /> Try again
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          : null}

        {/* Results */}
        {result?.ok && analysis ? (
          <div className="mt-2 space-y-10">
            <div className="surface-card flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-center">
              <ScoreRing score={analysis.score} />
              <div className="min-w-0 text-center sm:text-left">
                <h2 className="font-display text-2xl font-bold">{verdict}</h2>
                <p className="mt-1 break-all text-sm text-muted-foreground">
                  {result.data.finalUrl}
                  {result.data.redirected ? " (after redirect)" : ""}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Pill>HTTP {result.data.status}</Pill>
                  <Pill>{result.data.responseTimeMs} ms</Pill>
                  <Pill>
                    {analysis.fixes.filter((f) => f.severity === "critical").length} critical
                  </Pill>
                  {result.data.spaTrap ? <Pill tone="danger">Tags need JavaScript</Pill> : null}
                </div>
              </div>
            </div>

            {result.data.spaTrap ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
                <h2 className="font-display text-lg font-bold text-destructive">
                  Heads up: your page is empty until JavaScript runs
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The raw HTML we received is basically an empty container with no real title or
                  description. X, LinkedIn, Slack and WhatsApp never run JavaScript, so they see
                  nothing — which is why your shares look blank. The fixes below put those tags in
                  the HTML itself.
                </p>
              </div>
            ) : null}

            <section>
              <h2 className="font-display text-2xl font-bold">How your link looks today</h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Each card uses your real tags and falls back exactly the way that platform does.
              </p>
              <PreviewCards data={result.data} />
            </section>

            <section>
              <h2 className="font-display text-2xl font-bold">What to fix, in order</h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Copy the HTML, or copy the prompt straight into your own Lovable project.
              </p>
              <FixList fixes={analysis.fixes} passed={analysis.passed} />
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
        tone === "danger"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-secondary text-secondary-foreground"
      }`}
    >
      {children}
    </span>
  );
}
