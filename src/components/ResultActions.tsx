import { useState } from "react";
import { Check, ClipboardCopy, Download, Link as LinkIcon, RefreshCw, Wand2 } from "lucide-react";
import type { Analysis } from "@/lib/analysis";
import type { AuditData } from "@/lib/audit-types";
import { combinedPrompt, combinedSnippet, reportMarkdown, shareUrl } from "@/lib/report";

type ActionId = "share" | "html" | "prompt";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function ResultActions({
  data,
  analysis,
  onRecheck,
  busy,
}: {
  data: AuditData;
  analysis: Analysis;
  onRecheck: () => void;
  busy: boolean;
}) {
  const [done, setDone] = useState<ActionId | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async (id: ActionId, text: string) => {
    const ok = await copy(text);
    setFailed(!ok);
    setDone(ok ? id : null);
    if (ok) setTimeout(() => setDone((d) => (d === id ? null : d)), 1800);
  };

  const hasFixes = analysis.fixes.length > 0;
  const host = (() => {
    try {
      return new URL(data.finalUrl).hostname;
    } catch {
      return "site";
    }
  })();

  const btn =
    "inline-flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Report actions">
      <button
        type="button"
        className={btn}
        onClick={() => run("share", shareUrl(window.location.origin, data.requestedUrl))}
      >
        {done === "share" ? (
          <Check className="size-4 text-success" />
        ) : (
          <LinkIcon className="size-4" />
        )}
        {done === "share" ? "Link copied" : "Share report"}
      </button>
      {hasFixes ? (
        <>
          <button
            type="button"
            className={btn}
            onClick={() => run("html", combinedSnippet(analysis.fixes))}
          >
            {done === "html" ? (
              <Check className="size-4 text-success" />
            ) : (
              <ClipboardCopy className="size-4" />
            )}
            {done === "html" ? "Copied" : "Copy all HTML"}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => run("prompt", combinedPrompt(analysis.fixes, data.finalUrl))}
          >
            {done === "prompt" ? (
              <Check className="size-4 text-success" />
            ) : (
              <Wand2 className="size-4" />
            )}
            {done === "prompt" ? "Copied" : "Copy one Lovable prompt"}
          </button>
        </>
      ) : null}
      <button
        type="button"
        className={btn}
        onClick={() => download(`previewproof-${host}.md`, reportMarkdown(data, analysis))}
      >
        <Download className="size-4" />
        Download report
      </button>
      <button type="button" className={btn} onClick={onRecheck} disabled={busy}>
        <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
        Check again
      </button>
      {failed ? (
        <p role="status" className="basis-full text-xs text-destructive">
          Your browser blocked clipboard access. Select the text in the fix below and copy it
          manually.
        </p>
      ) : null}
    </div>
  );
}
