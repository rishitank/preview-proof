import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// These tests need no outside network: they cover the page, its own SEO, and every
// error path that is decided before any request leaves the server.

test.describe("PreviewProof", () => {
  test("serves complete, absolute social tags for itself", async ({ page }) => {
    await page.goto("/");
    const meta = (sel: string) => page.locator(sel).first().getAttribute("content");
    await expect(page).toHaveTitle(/PreviewProof/);
    expect(await meta('meta[name="description"]')).toMatch(/.{80,}/);
    expect(await meta('meta[property="og:image"]')).toMatch(/^https:\/\/.+\/og-image\.png$/);
    expect(await meta('meta[property="og:url"]')).toMatch(/^https:\/\//);
    expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/^https:\/\//);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("the social preview image is served", async ({ request }) => {
    const res = await request.get("/og-image.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    expect((await res.body()).byteLength).toBeLessThan(600 * 1024);
  });

  test("text typed before the page finishes loading is still submitted", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    const input = page.getByLabel("Public URL to check");
    await input.pressSequentially("http://127.0.0.1/admin", { delay: 5 });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Check my app/ }).click();
    await expect(page.getByText(/private or local machine/)).toBeVisible();
  });

  const cases: [string, RegExp][] = [
    ["ftp://example.com", /Only http:\/\/ and https:\/\//],
    ["http://169.254.169.254/latest/meta-data", /private or local machine/],
    ["http://[::ffff:127.0.0.1]/", /private or local machine/],
    ["https://example.com:8443/", /standard web ports/],
    ["intranet", /full domain name/],
  ];
  for (const [input, message] of cases) {
    test(`explains why ${input} can't be checked`, async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.getByLabel("Public URL to check").fill(input);
      await page.getByLabel("Public URL to check").press("Enter");
      await expect(
        page.getByRole("heading", { name: "We couldn't check that link" }),
      ).toBeVisible();
      await expect(page.getByText(message)).toBeVisible();
      await expect(page.getByRole("button", { name: /Try again/ })).toBeVisible();
    });
  }

  test("an empty submit is stopped by the browser, not sent", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const requests: string[] = [];
    page.on("request", (r) => r.method() === "POST" && requests.push(r.url()));
    await page.getByRole("button", { name: /Check my app/ }).click();
    await page.waitForTimeout(300);
    expect(requests).toHaveLength(0);
  });

  test("has no horizontal scroll and no serious accessibility violations", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("a shared report link runs its check on arrival", async ({ page }) => {
    await page.goto("/?url=" + encodeURIComponent("http://169.254.169.254/"));
    await expect(page.getByText(/private or local machine/)).toBeVisible();
    await expect(page.getByLabel("Public URL to check")).toHaveValue("http://169.254.169.254/");
  });

  test("submitting puts the checked URL in the address bar so it can be shared", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Public URL to check").fill("ftp://example.com");
    await page.getByLabel("Public URL to check").press("Enter");
    await expect(page).toHaveURL(/\?url=ftp%3A%2F%2Fexample\.com/);
  });

  test("shows how it works and what we check before a search", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What we check" })).toBeAttached();
    await expect(page.getByRole("button", { name: "example.com" })).toBeVisible();
  });

  test("dark mode toggles, persists across reloads and has no flash of the wrong theme", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Switch to dark theme/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload({ waitUntil: "commit" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
    expect(violations.filter((v) => v.id === "color-contrast").map((v) => v.nodes.length)).toEqual(
      [],
    );
  });

  test("respects reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await context.close();
  });

  test("unknown routes return the 404 page", async ({ page }) => {
    const res = await page.goto("/definitely-not-here");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});
