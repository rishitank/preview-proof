import type { Analysis, Fix } from "./analysis";
import type { AuditData } from "./audit-types";

/** Every fix's HTML merged into one <head> block, keeping one copy of each tag. */
export function combinedSnippet(fixes: Fix[]): string {
  const seen = new Set<string>();
  const tagKey = (line: string) => {
    const t = line.trim();
    const attr = t.match(/^<meta\s+(?:name|property)="([^"]+)"/i)?.[1];
    if (attr) return `meta:${attr.toLowerCase()}`;
    const rel = t.match(/^<link\s+rel="([^"]+)"/i)?.[1];
    if (rel) return `link:${rel.toLowerCase()}`;
    const el = t.match(/^<(title|html|h1)\b/i)?.[1];
    return el ? `el:${el.toLowerCase()}` : `raw:${t}`;
  };
  const lines: string[] = [];
  for (const fix of fixes) {
    for (const line of fix.snippet.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("<!--") || t.endsWith("-->")) continue;
      const key = tagKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(t);
    }
  }
  return lines.join("\n");
}

/** All fixes as a single, ordered prompt for an AI app builder. */
export function combinedPrompt(fixes: Fix[], url: string): string {
  if (!fixes.length) return "";
  const steps = fixes.map((f, i) => `${i + 1}. ${f.prompt}`).join("\n");
  return `Improve how ${url} looks when it's shared and found in search. Make these changes, most important first, and keep everything else as it is:\n${steps}`;
}

export function reportMarkdown(d: AuditData, a: Analysis, checkedAt = new Date()): string {
  const out: string[] = [];
  out.push(`# PreviewProof report: ${d.finalUrl}`);
  out.push("");
  out.push(`- Score: **${a.score}/100**`);
  out.push(`- HTTP ${d.status}, first response in ${d.responseTimeMs} ms`);
  out.push(`- Checked: ${checkedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`);
  out.push("");
  if (a.fixes.length) {
    out.push("## What to fix");
    for (const f of a.fixes) {
      out.push("");
      out.push(`### ${f.title} (${f.severity === "nice" ? "nice to have" : f.severity})`);
      out.push("");
      out.push(f.why);
      out.push("");
      out.push("```html");
      out.push(f.snippet);
      out.push("```");
      out.push("");
      out.push(`> Prompt: ${f.prompt}`);
    }
    out.push("");
  }
  if (a.passed.length) {
    out.push("## Already good");
    out.push("");
    for (const p of a.passed) out.push(`- ${p}`);
    out.push("");
  }
  return out.join("\n");
}

/** A link that re-runs this audit when opened. */
export function shareUrl(origin: string, target: string): string {
  const u = new URL("/", origin);
  u.searchParams.set("url", target);
  return u.toString();
}
