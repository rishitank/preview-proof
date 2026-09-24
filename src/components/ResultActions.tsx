import { useState } from "react";
import { Check, ClipboardCopy, Download, Link as LinkIcon, RefreshCw, Wand2 } from "lucide-react";
import type { Analysis } from "@/lib/analysis";
import type { AuditData } from "@/lib/audit-types";
import { combinedPrompt, combinedSnippet, reportMarkdown, shareUrl } from "@/lib/report";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Report actions">
      <Button
        type="button"
        variant="glass"
        size="action"
        onClick={() => run("share", shareUrl(window.location.origin, data.requestedUrl))}
      >
        {done === "share" ? (
          <Check className="text-success" aria-hidden />
        ) : (
          <LinkIcon aria-hidden />
        )}
        {done === "share" ? "Link copied" : "Share report"}
      </Button>
      {hasFixes ? (
        <>
          <Button
            type="button"
            variant="glass"
            size="action"
            onClick={() => run("html", combinedSnippet(analysis.fixes))}
          >
            {done === "html" ? (
              <Check className="text-success" aria-hidden />
            ) : (
              <ClipboardCopy aria-hidden />
            )}
            {done === "html" ? "Copied" : "Copy all HTML"}
          </Button>
          <Button
            type="button"
            variant="glass"
            size="action"
            onClick={() => run("prompt", combinedPrompt(analysis.fixes, data.finalUrl))}
          >
            {done === "prompt" ? (
              <Check className="text-success" aria-hidden />
            ) : (
              <Wand2 aria-hidden />
            )}
            {done === "prompt" ? "Copied" : "Copy one Lovable prompt"}
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="glass"
        size="action"
        onClick={() => download(`previewproof-${host}.md`, reportMarkdown(data, analysis))}
      >
        <Download aria-hidden />
        Download report
      </Button>
      <Button type="button" variant="glass" size="action" onClick={onRecheck} disabled={busy}>
        <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden />
        Check again
      </Button>
      {failed ? (
        <p role="status" className="basis-full text-xs text-destructive-strong">
          Your browser blocked clipboard access. Select the text in the fix below and copy it
          manually.
        </p>
      ) : null}
    </div>
  );
}
