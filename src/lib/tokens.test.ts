import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Colour contrast is checked here, at the token level, because axe can't evaluate text on
 * gradients or translucent glass. Every text/background pair the UI relies on must meet
 * WCAG AA for normal-size text (4.5:1) in both themes.
 */

const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block`);
  return css.slice(start, css.indexOf("\n}", start));
}

type Oklch = [number, number, number];

function tokens(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block(selector).matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const parseOklch = (v: string): Oklch => {
  const m = v.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`not an oklch colour: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

/** OKLCH → relative luminance (linear sRGB, clamped to gamut). */
function luminance([L, C, h]: Oklch): number {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

const contrast = (x: Oklch, y: Oklch) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const root = tokens(":root");
const themes = { light: root, dark: { ...root, ...tokens(".dark") } };

describe.each(Object.entries(themes))("%s theme tokens", (_name, t) => {
  const c = (name: string) => parseOklch(t[name]!);

  it.each([
    ["foreground", "background"],
    ["muted-foreground", "background"],
    ["muted-foreground", "surface"],
    ["primary-foreground", "primary"],
    ["destructive-strong", "background"],
    ["destructive-strong", "surface"],
    ["warning-strong", "background"],
    ["warning-strong", "surface"],
  ])("%s on %s meets 4.5:1", (fg, bg) => {
    expect(contrast(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("button text meets 4.5:1 across the whole brand gradient", () => {
    const stops = [...t["gradient-brand"]!.matchAll(/oklch\([^)]+\)/g)].map((m) =>
      parseOklch(m[0]),
    );
    expect(stops.length).toBeGreaterThanOrEqual(2);
    for (const stop of stops) {
      expect(contrast(c("primary-foreground"), stop)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
