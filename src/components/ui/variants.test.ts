import { describe, expect, it } from "vitest";
import { badgeVariants } from "./badge";
import { buttonVariants } from "./button";

const classes = (s: string) => s.split(/\s+/);

describe("variant helpers resolve conflicting utilities", () => {
  it("a button size overrides the base text size and radius", () => {
    const c = classes(buttonVariants({ variant: "brand", size: "cta" }));
    expect(c).toContain("text-base");
    expect(c).not.toContain("text-sm");
    expect(c).toContain("rounded-xl");
    expect(c).not.toContain("rounded-md");
    expect(c).not.toContain("h-9");
  });

  it("caller classes win over variant classes", () => {
    const c = classes(buttonVariants({ variant: "chip", size: "chip", className: "rounded-lg" }));
    expect(c).toContain("rounded-lg");
    expect(c).not.toContain("rounded-full");
  });

  it("a small badge overrides the base text size", () => {
    const c = classes(badgeVariants({ variant: "critical", size: "sm" }));
    expect(c).toContain("text-[11px]");
    expect(c).not.toContain("text-xs");
  });

  it("severity badges use the contrast-safe text tokens", () => {
    expect(badgeVariants({ variant: "critical" })).toContain("text-destructive-strong");
    expect(badgeVariants({ variant: "important" })).toContain("text-warning-strong");
  });
});
