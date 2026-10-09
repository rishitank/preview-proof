import type { Analysis } from "@/lib/analysis";
import type { AuditData } from "@/lib/audit-types";
import { FixList } from "@/components/FixList";
import { PreviewCards } from "@/components/PreviewCards";
import { ResultActions } from "@/components/ResultActions";
import { ScoreRing } from "@/components/ScoreRing";
import { Badge } from "@/components/ui/badge";

// The finished report. It is only ever shown after a check, so the index route loads it (and the
// previews, fixes and report helpers it pulls in) on demand instead of shipping it in the
// first-load bundle. See loadAuditReport in src/routes/index.tsx.
export function AuditReport({
  data,
  analysis,
  verdict,
  busy,
  onRecheck,
}: {
  data: AuditData;
  analysis: Analysis;
  verdict: string;
  busy: boolean;
  onRecheck: () => void;
}) {
  return (
    <>
      <div className="glass flex flex-col items-center gap-6 rounded-2xl p-6 sm:flex-row sm:items-center">
        <ScoreRing score={analysis.score} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="font-display text-2xl font-bold">{verdict}</h2>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {data.finalUrl}
            {data.redirected ? " (after redirect)" : ""}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Badge variant="secondary">HTTP {data.status}</Badge>
            <Badge variant="secondary">{data.responseTimeMs} ms</Badge>
            <Badge variant="secondary">
              {analysis.fixes.filter((f) => f.severity === "critical").length} critical
            </Badge>
            {data.spaTrap ? <Badge variant="destructive">Blank without JavaScript</Badge> : null}
          </div>
          <div className="mt-5 flex justify-center sm:justify-start">
            <ResultActions data={data} analysis={analysis} busy={busy} onRecheck={onRecheck} />
          </div>
        </div>
      </div>

      {data.spaTrap ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 backdrop-blur">
          <h2 className="font-display text-lg font-bold text-destructive-strong">
            Heads up: your page is empty until JavaScript runs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.builtWithLovable
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
          Each card is built from your real tags and the fallbacks each platform is known to use.
          Platforms tweak their layouts, so treat these as close previews.
        </p>
        <PreviewCards data={data} />
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
    </>
  );
}
