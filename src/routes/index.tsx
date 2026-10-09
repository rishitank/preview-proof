import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, MotionConfig, m } from "motion/react";
import {
  ArrowRight,
  Clock,
  History,
  Link2Off,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { auditUrl } from "@/lib/audit.functions";
import type { Analysis } from "@/lib/analysis";
import type { AuditResponse } from "@/lib/audit-types";
import { OG_IMAGE_URL, SITE_URL } from "@/lib/site";
import { Backdrop } from "@/components/Backdrop";
import { Landing } from "@/components/Landing";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { loadRecent, saveRecent, type RecentCheck } from "@/lib/recent";
import { Button, buttonVariants } from "@/components/ui/button";

// The report (score ring, previews, fixes, export actions) and the scoring code only matter once
// a check has run, so they live in their own chunks. A check starts fetching both alongside the
// audit request, so they are normally in place before the result arrives.
const loadAuditReport = () => import("@/components/AuditReport");
const AuditReport = lazy(() => loadAuditReport().then((mod) => ({ default: mod.AuditReport })));

type Checked = { response: AuditResponse; analysis: Analysis | null };

const TITLE = "PreviewProof: see how your app looks when people share it";
const DESCRIPTION =
  "Paste a public URL and see the Google, X, LinkedIn, Slack and WhatsApp previews your app produces today, what's broken, and copy-paste fixes.";

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
  validateSearch: (search: Record<string, unknown>): { url?: string } =>
    typeof search["url"] === "string" && search["url"].trim() ? { url: search["url"].trim() } : {},
  component: Index,
});

const ERROR_ICONS = {
  invalid_url: Link2Off,
  blocked_host: ShieldAlert,
  blocked_port: ShieldAlert,
  timeout: Clock,
  fetch_failed: Link2Off,
  not_html: Link2Off,
  bot_blocked: ShieldAlert,
} as const;

const EXAMPLES = ["github.com", "example.com", "vercel.com"];

const LOADING_STEPS = [
  "Checking the address is public…",
  "Fetching your page like a link-preview bot…",
  "Reading your title, description and social tags…",
  "Checking your preview image loads…",
];

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
};

function LoadingPanel() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <m.div {...fadeUp} className="glass rounded-2xl p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
        <AnimatePresence mode="wait">
          <m.p
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="font-display font-semibold"
          >
            {LOADING_STEPS[step]}
          </m.p>
        </AnimatePresence>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-4">
            <div className="shimmer h-28 rounded-lg" />
            <div className="shimmer h-3 w-2/3 rounded" />
            <div className="shimmer h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </m.div>
  );
}

const fixCountText = (n: number) =>
  n === 0 ? "Nothing to fix." : n === 1 ? "1 thing to fix." : `${n} things to fix.`;

function Index() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  // Uncontrolled on purpose: a controlled value would wipe anything typed before hydration.
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<RecentCheck[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);
  const run = useServerFn(auditUrl);

  const mutation = useMutation<Checked, Error, string>({
    mutationFn: async (value: string) => {
      const [response, { analyse }] = await Promise.all([
        run({ data: { url: value } }),
        import("@/lib/analysis"),
        loadAuditReport(),
      ]);
      return { response, analysis: response.ok ? analyse(response.data) : null };
    },
  });

  const result = mutation.data?.response;
  const analysis = mutation.data?.analysis ?? null;

  const check = (value: string) => {
    const v = value.trim();
    if (!v || mutation.isPending) return;
    if (inputRef.current && inputRef.current.value !== v) inputRef.current.value = v;
    // Mark the URL as handled so the ?url= effect below doesn't run the same check again.
    autoRan.current = true;
    void navigate({ search: { url: v }, replace: true });
    mutation.mutate(v);
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read the live field value, not just React state: text typed before hydration never fired onChange.
    check(String(new FormData(e.currentTarget).get("url") ?? ""));
  };

  // Recent checks live in this browser only, so load them after hydration.
  useEffect(() => setRecent(loadRecent()), []);

  // A shared report link (?url=...) runs its audit on arrival, once.
  useEffect(() => {
    if (autoRan.current || !search.url) return;
    autoRan.current = true;
    mutation.mutate(search.url);
  }, [search.url, mutation]);

  useEffect(() => {
    if (result?.ok && analysis) {
      setRecent(
        saveRecent({ url: result.data.requestedUrl, score: analysis.score, at: Date.now() }),
      );
    }
  }, [result, analysis]);

  // Move focus to the outcome so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (mutation.isSuccess || mutation.isError) resultsRef.current?.focus({ preventScroll: true });
    if (mutation.isSuccess || mutation.isError) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      resultsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [mutation.isSuccess, mutation.isError, mutation.submittedAt]);

  const verdict =
    analysis == null
      ? ""
      : analysis.score >= 85
        ? "Your link looks great wherever it lands."
        : analysis.score >= 60
          ? "Decent, but sharers are seeing less than they should."
          : "Right now most shares of your app look broken or blank.";

  const idle = !mutation.isPending && !result && !mutation.isError;
  const displayHost = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <MotionConfig reducedMotion="user">
      <Backdrop />
      <SiteHeader />
      <main className="min-h-screen">
        <section className="mx-auto max-w-3xl px-4 pb-10 pt-14 text-center sm:pt-20">
          <m.span
            initial={{ y: 10 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            Built for apps that deserve to spread
          </m.span>
          <m.h1
            // Transform only: the headline is the LCP element, so it must be visible from first paint.
            initial={{ y: 14 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-balance text-4xl font-bold leading-[1.05] sm:text-6xl"
          >
            See your link the way
            <span className="block bg-gradient-brand bg-clip-text pb-1 text-transparent">
              the internet sees it
            </span>
          </m.h1>
          <m.p
            initial={{ y: 10 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg"
          >
            Paste a public URL. We fetch it the way sharing bots do, with no JavaScript, then show
            you the previews your tags produce and how to fix what's missing.
          </m.p>

          <m.form
            onSubmit={submit}
            initial={{ y: 14 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-8 max-w-xl"
          >
            <div className="glass group flex flex-col gap-2 rounded-2xl p-2 transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_22%,transparent)] sm:flex-row">
              <label htmlFor="url" className="sr-only">
                Public URL to check
              </label>
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  id="url"
                  type="text"
                  name="url"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  ref={inputRef}
                  defaultValue={search.url ?? ""}
                  placeholder="yourapp.lovable.app"
                  aria-label="Public URL to check"
                  className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground"
                />
              </div>
              <m.button
                type="submit"
                disabled={mutation.isPending}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={buttonVariants({ variant: "brand", size: "cta" })}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden /> Checking…
                  </>
                ) : (
                  <>
                    Check my app <ArrowRight aria-hidden />
                  </>
                )}
              </m.button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              {recent.length ? (
                <>
                  <History className="size-3.5" aria-hidden />
                  <span>Recent:</span>
                  {recent.map((r) => (
                    <Button
                      key={r.url}
                      type="button"
                      variant="chip"
                      size="chip"
                      onClick={() => check(r.url)}
                      title={r.url}
                      className="max-w-[16rem]"
                    >
                      <span className="truncate">{displayHost(r.url)}</span>
                      <span className="text-muted-foreground">· {r.score}</span>
                    </Button>
                  ))}
                </>
              ) : (
                <>
                  <span>Try:</span>
                  {EXAMPLES.map((ex) => (
                    <Button
                      key={ex}
                      type="button"
                      variant="chip"
                      size="chip"
                      onClick={() => check(ex)}
                    >
                      {ex}
                    </Button>
                  ))}
                </>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Public pages only. We don't keep the pages you check; recent checks stay in your
              browser.
            </p>
          </m.form>
        </section>

        <div
          ref={resultsRef}
          tabIndex={-1}
          aria-busy={mutation.isPending}
          className="mx-auto max-w-5xl scroll-mt-24 px-4 pb-16 outline-none"
        >
          {/* A short announcement for screen readers, instead of reading the whole report aloud. */}
          <p role="status" className="sr-only">
            {mutation.isPending
              ? "Checking the link."
              : result?.ok && analysis
                ? `Check finished. Score ${analysis.score} out of 100. ${fixCountText(analysis.fixes.length)}`
                : result && !result.ok
                  ? "We couldn't check that link."
                  : mutation.isError
                    ? "Something went wrong. Please try again."
                    : ""}
          </p>
          {/* Enter-only animations: never gate a result on an exit animation finishing. */}
          <>
            {mutation.isPending ? <LoadingPanel key="loading" /> : null}

            {!mutation.isPending && mutation.isError ? (
              <m.div
                key="crash"
                {...fadeUp}
                className="glass rounded-2xl border-destructive/40 p-6"
              >
                <h2 className="font-display text-lg font-bold text-destructive-strong">
                  Something went wrong
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We couldn't finish the check. Please try again in a moment.
                </p>
              </m.div>
            ) : null}

            {!mutation.isPending && result && !result.ok
              ? (() => {
                  const Icon = ERROR_ICONS[result.error.code] ?? Link2Off;
                  return (
                    <m.div key="error" {...fadeUp} className="glass rounded-2xl p-6">
                      <div className="flex items-start gap-3">
                        <Icon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                        <div>
                          <h2 className="font-display text-lg font-bold">
                            We couldn't check that link
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {result.error.message}
                          </p>
                          <Button
                            type="button"
                            variant="glass"
                            size="action"
                            className="mt-4"
                            onClick={() =>
                              mutation.variables && mutation.mutate(mutation.variables)
                            }
                          >
                            <RefreshCw aria-hidden /> Try again
                          </Button>
                        </div>
                      </div>
                    </m.div>
                  );
                })()
              : null}

            {!mutation.isPending && result?.ok && analysis ? (
              <m.div key={`result-${result.data.finalUrl}`} {...fadeUp} className="space-y-12">
                <Suspense fallback={null}>
                  <AuditReport
                    data={result.data}
                    analysis={analysis}
                    verdict={verdict}
                    busy={mutation.isPending}
                    onRecheck={() => check(result.data.requestedUrl)}
                  />
                </Suspense>
              </m.div>
            ) : null}
          </>

          {/* Always rendered, so the header's "How it works" links work after a check too. */}
          <div className={idle ? undefined : "mt-20"}>
            <Landing />
          </div>
        </div>
      </main>
      <SiteFooter />
    </MotionConfig>
  );
}
