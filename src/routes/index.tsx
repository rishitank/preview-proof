import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
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
import { analyse } from "@/lib/analysis";
import type { AuditResponse } from "@/lib/audit-types";
import { PreviewCards } from "@/components/PreviewCards";
import { OG_IMAGE_URL, SITE_URL } from "@/lib/site";
import { FixList } from "@/components/FixList";
import { ScoreRing } from "@/components/ScoreRing";
import { Backdrop } from "@/components/Backdrop";
import { Landing } from "@/components/Landing";
import { ResultActions } from "@/components/ResultActions";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { loadRecent, saveRecent, type RecentCheck } from "@/lib/recent";

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
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
};

function LoadingPanel() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div {...fadeUp} className="glass rounded-2xl p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
        <AnimatePresence mode="wait">
          <motion.p
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="font-display font-semibold"
          >
            {LOADING_STEPS[step]}
          </motion.p>
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
    </motion.div>
  );
}

function Index() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  // Uncontrolled on purpose: a controlled value would wipe anything typed before hydration.
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<RecentCheck[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const run = useServerFn(auditUrl);

  const mutation = useMutation<AuditResponse, Error, string>({
    mutationFn: (value: string) => run({ data: { url: value } }),
  });

  const result = mutation.data;
  const analysis = useMemo(() => (result?.ok ? analyse(result.data) : null), [result]);

  const check = (value: string) => {
    const v = value.trim();
    if (!v || mutation.isPending) return;
    if (inputRef.current && inputRef.current.value !== v) inputRef.current.value = v;
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

  // A shared report link (?url=...) runs its audit on arrival.
  const autoRan = useRef(false);
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
    if (mutation.isSuccess || mutation.isError)
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
          <motion.span
            initial={{ y: 10 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            Built for apps that deserve to spread
          </motion.span>
          <motion.h1
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
          </motion.h1>
          <motion.p
            initial={{ y: 10 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg"
          >
            Paste a public URL. We fetch it exactly like a sharing bot does, with no JavaScript,
            then show you the real previews and how to fix what's missing.
          </motion.p>

          <motion.form
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
              <motion.button
                type="submit"
                disabled={mutation.isPending}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-5 py-3 text-base font-semibold text-primary-foreground shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Checking…
                  </>
                ) : (
                  <>
                    Check my app <ArrowRight className="size-4" aria-hidden />
                  </>
                )}
              </motion.button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              {recent.length ? (
                <>
                  <History className="size-3.5" aria-hidden />
                  <span>Recent:</span>
                  {recent.map((r) => (
                    <button
                      key={r.url}
                      type="button"
                      onClick={() => check(r.url)}
                      className="rounded-full border border-border bg-surface/60 px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      {displayHost(r.url)}{" "}
                      <span className="text-muted-foreground">· {r.score}</span>
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <span>Try:</span>
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => check(ex)}
                      className="rounded-full border border-border bg-surface/60 px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      {ex}
                    </button>
                  ))}
                </>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Public pages only. Nothing is stored.
            </p>
          </motion.form>
        </section>

        <div
          ref={resultsRef}
          tabIndex={-1}
          aria-live="polite"
          aria-busy={mutation.isPending}
          className="mx-auto max-w-5xl scroll-mt-24 px-4 pb-16 outline-none"
        >
          <AnimatePresence mode="wait">
            {mutation.isPending ? <LoadingPanel key="loading" /> : null}

            {!mutation.isPending && mutation.isError ? (
              <motion.div
                key="crash"
                {...fadeUp}
                className="glass rounded-2xl border-destructive/40 p-6"
              >
                <h2 className="font-display text-lg font-bold text-destructive">
                  Something went wrong
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We couldn't finish the check. Please try again in a moment.
                </p>
              </motion.div>
            ) : null}

            {!mutation.isPending && result && !result.ok
              ? (() => {
                  const Icon = ERROR_ICONS[result.error.code] ?? Link2Off;
                  return (
                    <motion.div key="error" {...fadeUp} className="glass rounded-2xl p-6">
                      <div className="flex items-start gap-3">
                        <Icon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                        <div>
                          <h2 className="font-display text-lg font-bold">
                            We couldn't check that link
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {result.error.message}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              mutation.variables && mutation.mutate(mutation.variables)
                            }
                            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                          >
                            <RefreshCw className="size-4" aria-hidden /> Try again
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })()
              : null}

            {!mutation.isPending && result?.ok && analysis ? (
              <motion.div key={`result-${result.data.finalUrl}`} {...fadeUp} className="space-y-12">
                <div className="glass flex flex-col items-center gap-6 rounded-2xl p-6 sm:flex-row sm:items-center">
                  <ScoreRing score={analysis.score} />
                  <div className="min-w-0 flex-1 text-center sm:text-left">
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
                      {result.data.spaTrap ? (
                        <Pill tone="danger">Blank without JavaScript</Pill>
                      ) : null}
                    </div>
                    <div className="mt-5 flex justify-center sm:justify-start">
                      <ResultActions
                        data={result.data}
                        analysis={analysis}
                        busy={mutation.isPending}
                        onRecheck={() => check(result.data.requestedUrl)}
                      />
                    </div>
                  </div>
                </div>

                {result.data.spaTrap ? (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 backdrop-blur">
                    <h2 className="font-display text-lg font-bold text-destructive">
                      Heads up: your page is empty until JavaScript runs
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {result.data.builtWithLovable
                        ? "This looks like an older Lovable app. Lovable pre-renders those for verified crawlers, so Google and the big networks may be fine, but every other unfurler, SEO tool and AI agent sees an empty page. Upgrading the project to server-side rendering fixes it for everyone."
                        : "The raw HTML we received is basically an empty container. X, LinkedIn, Slack and WhatsApp don't run JavaScript, so they see nothing, which is why your shares look blank. The fixes below put those tags in the HTML itself."}
                    </p>
                  </div>
                ) : null}

                <section aria-labelledby="previews-heading">
                  <h2 id="previews-heading" className="font-display text-2xl font-bold">
                    How your link looks today
                  </h2>
                  <p className="mb-4 mt-1 text-sm text-muted-foreground">
                    Each card uses your real tags and falls back exactly the way that platform does.
                  </p>
                  <PreviewCards data={result.data} />
                </section>

                <section aria-labelledby="fixes-heading">
                  <h2 id="fixes-heading" className="font-display text-2xl font-bold">
                    What to fix, in order
                  </h2>
                  <p className="mb-4 mt-1 text-sm text-muted-foreground">
                    Copy the HTML, or copy the prompt straight into your own Lovable project.
                  </p>
                  <FixList fixes={analysis.fixes} passed={analysis.passed} />
                </section>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {idle ? <Landing /> : null}
        </div>
      </main>
      <SiteFooter />
    </MotionConfig>
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
          : "border-border bg-secondary/70 text-secondary-foreground"
      }`}
    >
      {children}
    </span>
  );
}
