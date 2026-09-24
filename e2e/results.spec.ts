import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The dev server runs with PREVIEWPROOF_FAKE_NET=1 (see playwright.config.ts), so these
// hosts are served by src/test/fake-net.ts. No test here touches the real internet.

async function audit(page: Page, url: string) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Public URL to check").fill(url);
  await page.getByRole("button", { name: /Check my app/ }).click();
}

async function expectNoSeriousA11yIssues(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test.describe("Results", () => {
  test("a well-tagged site scores 100 with every preview and no fixes", async ({ page }) => {
    await audit(page, "https://good.example/");
    await expect(
      page.getByRole("heading", { name: /looks great wherever it lands/ }),
    ).toBeVisible();
    await expect(page.getByText("Score: 100 out of 100")).toBeAttached();
    for (const name of ["Google search result", "X (Twitter)", "LinkedIn post", "Slack unfurl"]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Already good" })).toBeVisible();
    // The fake og.png can't load in the browser, like a hotlink-protected image: no broken icons.
    await expect(page.getByText(/Image found, but its host blocks/).first()).toBeVisible();
    await expect(page.getByAltText("Social preview")).toHaveCount(0);
    const actions = page.getByRole("group", { name: "Report actions" });
    await expect(actions.getByRole("button", { name: "Copy all HTML" })).toHaveCount(0);
    await expect(actions.getByRole("button", { name: "Share report" })).toBeVisible();
  });

  test("a blank SPA shell gets the warning banner and critical fixes", async ({ page }) => {
    await audit(page, "https://spa.example/");
    await expect(page.getByRole("heading", { name: /empty until JavaScript runs/ })).toBeVisible();
    await expect(
      page.getByText(/X, LinkedIn, Slack and WhatsApp don't run JavaScript/),
    ).toBeVisible();
    await expect(page.getByText("Blank without JavaScript")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /most shares of your app look broken/ }),
    ).toBeVisible();
    await expect(page.getByText(/Placeholder title: "Vite \+ React \+ TS"/)).toBeVisible();
    await expect(page.getByText("No social preview image")).toBeVisible();
  });

  test("an older Lovable app gets the verified-crawler nuance and the stock-image fix", async ({
    page,
  }) => {
    await audit(page, "https://lovable-old.example/");
    await expect(page.getByText(/older Lovable app\. Lovable pre-renders those/)).toBeVisible();
    await expect(page.getByText("Your preview image is the template's stock image")).toBeVisible();
  });

  test("a bot challenge is reported as blocked, not graded as broken", async ({ page }) => {
    await audit(page, "https://guarded.example/");
    await expect(page.getByRole("heading", { name: "We couldn't check that link" })).toBeVisible();
    await expect(page.getByText(/showed our checker a bot challenge/)).toBeVisible();
    await expect(page.getByText(/Score:/)).toHaveCount(0);
  });

  test("a public name that resolves to a private address is refused (DNS rebinding)", async ({
    page,
  }) => {
    await audit(page, "https://rebind.example/");
    await expect(page.getByText(/resolves to a private or local machine/)).toBeVisible();
  });

  test("fix actions copy HTML and the Lovable prompt, and the report downloads", async ({
    page,
    context,
    browserName,
  }, info) => {
    test.skip(info.project.name !== "desktop", "clipboard permissions are desktop-only here");
    test.skip(browserName !== "chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await audit(page, "https://spa.example/");
    const actions = page.getByRole("group", { name: "Report actions" });

    await actions.getByRole("button", { name: "Copy all HTML" }).click();
    await expect(actions.getByRole("button", { name: "Copied" })).toBeVisible();
    const html = await page.evaluate(() => navigator.clipboard.readText());
    expect(html).toContain("<title>");
    expect(html).toContain('property="og:image"');
    expect(html).not.toContain("&lt;");

    await actions.getByRole("button", { name: "Copy one Lovable prompt" }).click();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toMatch(/^Improve how https:\/\/spa\.example\/ looks/);
    expect(prompt).toMatch(/\n1\. /);

    await actions.getByRole("button", { name: "Share report" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /\/\?url=https%3A%2F%2Fspa\.example%2F$/,
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      actions.getByRole("button", { name: "Download report" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("previewproof-spa.example.md");
  });

  test("each fix expands to show its code", async ({ page }) => {
    await audit(page, "https://spa.example/");
    const toggle = page.locator("button[aria-expanded]").first();
    const before = await toggle.getAttribute("aria-expanded");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", before === "true" ? "false" : "true");
  });

  test("recent checks are remembered and re-runnable", async ({ page }) => {
    await audit(page, "https://good.example/");
    await expect(page.getByText("Score: 100 out of 100")).toBeAttached();
    await page.goto("/");
    const chip = page.getByRole("button", { name: /good\.example/ });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page.getByText("Score: 100 out of 100")).toBeAttached();
  });

  for (const theme of ["light", "dark"] as const) {
    test(`the results page fits the screen and passes axe in ${theme} mode`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("previewproof:theme", t), theme);
      await audit(page, "https://spa.example/");
      await expect(page.getByRole("heading", { name: "What to fix, in order" })).toBeVisible();
      await page.waitForTimeout(800); // let enter animations settle before measuring contrast
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await expectNoSeriousA11yIssues(page);
    });
  }
});
