// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { perfectAudit } from "@/test/fixtures";
import { analyse } from "./analysis";
import { combinedPrompt, combinedSnippet, reportMarkdown, shareUrl } from "./report";
import { clearRecent, loadRecent, saveRecent } from "./recent";

const messy = () =>
  analyse(
    perfectAudit({
      title: null,
      description: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogImageCheck: null,
      twitterCard: null,
      canonical: null,
    }),
  );

describe("combinedSnippet", () => {
  it("merges every fix into one head block without duplicate tags or comments", () => {
    const html = combinedSnippet(messy().fixes);
    const lines = html.split("\n");
    expect(lines.filter((l) => l.startsWith("<title>"))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('property="og:title"'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('name="twitter:image"'))).toHaveLength(1);
    expect(html).toContain('<link rel="canonical"');
    expect(html).not.toContain("<!--");
  });

  it("is empty when there is nothing to fix", () => {
    expect(combinedSnippet([])).toBe("");
  });
});

describe("combinedPrompt", () => {
  it("numbers every fix in priority order", () => {
    const { fixes } = messy();
    const prompt = combinedPrompt(fixes, "https://acme.example/");
    expect(prompt).toMatch(/^Improve how https:\/\/acme\.example\/ looks/);
    expect(prompt).toContain(`1. ${fixes[0]!.prompt}`);
    expect(prompt).toContain(`${fixes.length}. ${fixes.at(-1)!.prompt}`);
  });
  it("is empty when there is nothing to fix", () => expect(combinedPrompt([], "x")).toBe(""));
});

describe("reportMarkdown", () => {
  it("includes score, every fix with its code and prompt, and the passes", () => {
    const a = messy();
    const md = reportMarkdown(perfectAudit(), a, new Date("2026-09-24T12:00:00Z"));
    expect(md).toContain("# PreviewProof report: https://acme.example/");
    expect(md).toContain(`Score: **${a.score}/100**`);
    expect(md).toContain("2026-09-24 12:00 UTC");
    for (const f of a.fixes) expect(md).toContain(`### ${f.title}`);
    expect(md.match(/```html/g)?.length).toBe(a.fixes.length);
    expect(md).toContain("## Already good");
  });
});

describe("shareUrl", () => {
  it("builds an encoded link that re-runs the audit", () => {
    expect(shareUrl("https://preview-proof.lovable.app", "https://a.example/x?y=1&z=2")).toBe(
      "https://preview-proof.lovable.app/?url=https%3A%2F%2Fa.example%2Fx%3Fy%3D1%26z%3D2",
    );
  });
});

describe("recent checks", () => {
  afterEach(() => clearRecent());

  it("keeps the five most recent, newest first, without duplicates", () => {
    for (let i = 0; i < 7; i++) saveRecent({ url: `https://s${i}.example/`, score: i, at: i });
    saveRecent({ url: "https://s3.example/", score: 99, at: 100 });
    const list = loadRecent();
    expect(list).toHaveLength(5);
    expect(list[0]).toEqual({ url: "https://s3.example/", score: 99, at: 100 });
    expect(list.filter((r) => r.url === "https://s3.example/")).toHaveLength(1);
  });

  it("survives corrupt or hostile storage contents", () => {
    localStorage.setItem("previewproof:recent", "{not json");
    expect(loadRecent()).toEqual([]);
    localStorage.setItem(
      "previewproof:recent",
      JSON.stringify([{ url: 1 }, null, { url: "https://ok.example/", score: 5, at: 1 }]),
    );
    expect(loadRecent()).toEqual([{ url: "https://ok.example/", score: 5, at: 1 }]);
  });
});
