// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { perfectAudit } from "@/test/fixtures";
import { analyse } from "@/lib/analysis";
import { PreviewCards } from "./PreviewCards";
import { FixList } from "./FixList";
import { ScoreRing } from "./ScoreRing";

afterEach(cleanup);

const card = (name: string) =>
  screen.getByRole("heading", { name }).closest(".surface-card") as HTMLElement;

describe("PreviewCards", () => {
  it("renders all five platform previews from the page's tags", () => {
    render(<PreviewCards data={perfectAudit()} />);
    for (const name of [
      "Google search result",
      "X (Twitter)",
      "LinkedIn post",
      "Slack unfurl",
      "iMessage & WhatsApp",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    }
    expect(
      within(card("Google search result")).getByText("Acme: invoices in one click"),
    ).toBeTruthy();
    expect(within(card("X (Twitter)")).getByText("Large image card")).toBeTruthy();
    expect(within(card("LinkedIn post")).getByRole("img").getAttribute("src")).toBe(
      "https://acme.example/og.png",
    );
  });

  it("shows each platform's fallback when tags are missing", () => {
    render(
      <PreviewCards
        data={perfectAudit({
          title: null,
          description: null,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          ogImageCheck: null,
          twitterCard: null,
          favicon: null,
        })}
      />,
    );
    expect(within(card("X (Twitter)")).getByText(/posts as a bare link/i)).toBeTruthy();
    expect(within(card("LinkedIn post")).getByText("No image, so a small grey card")).toBeTruthy();
    expect(
      within(card("Google search result")).getByText(/Google guesses a snippet/i),
    ).toBeTruthy();
    expect(
      screen.queryAllByRole("img").filter((i) => i.getAttribute("src")?.includes("og.png")),
    ).toHaveLength(0);
  });

  it("hides a preview image that failed to load, like the platforms do", () => {
    render(<PreviewCards data={perfectAudit({ ogImageCheck: { ok: false, status: 404 } })} />);
    expect(screen.queryAllByRole("img", { name: /preview/i })).toHaveLength(0);
  });

  it("explains that a noindex page won't appear in Google", () => {
    render(<PreviewCards data={perfectAudit({ noindex: true })} />);
    expect(within(card("Google search result")).getByText(/won't appear in Google/i)).toBeTruthy();
  });

  it("warns that WhatsApp skips a heavy image", () => {
    render(
      <PreviewCards
        data={perfectAudit({
          ogImageCheck: { ok: true, status: 200, contentType: "image/png", bytes: 900_000 },
        })}
      />,
    );
    expect(screen.getByText(/over 600 KB/)).toBeTruthy();
  });

  it("renders hostile page text as text, never as markup", () => {
    const { container } = render(
      <PreviewCards
        data={perfectAudit({
          title: `<img src=x onerror="alert(1)">`,
          ogTitle: `<script>alert(1)</script>`,
        })}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getAllByText(`<script>alert(1)</script>`).length).toBeGreaterThan(0);
  });
});

describe("FixList", () => {
  it("groups fixes by severity and opens critical ones by default", () => {
    const { fixes, passed } = analyse(perfectAudit({ title: null, twitterCard: null, lang: null }));
    render(<FixList fixes={fixes} passed={passed} />);
    expect(screen.getByRole("heading", { name: /Critical \(1\)/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Important \(1\)/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Nice to have \(1\)/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Copy HTML/ })).toHaveLength(1); // only the critical one is open
    fireEvent.click(screen.getByRole("button", { name: /No language set/ }));
    expect(screen.getAllByRole("button", { name: /Copy HTML/ })).toHaveLength(2);
  });

  it("copies the snippet and the Lovable prompt to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { fixes, passed } = analyse(perfectAudit({ title: null }));
    render(<FixList fixes={fixes} passed={passed} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Copy HTML/ })));
    expect(writeText).toHaveBeenLastCalledWith(fixes[0]!.snippet);
    expect(screen.getByRole("button", { name: /Copied/ })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Copy prompt/ })));
    expect(writeText).toHaveBeenLastCalledWith(fixes[0]!.prompt);
  });

  it("tells the user when the clipboard is blocked instead of failing silently", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const { fixes, passed } = analyse(perfectAudit({ title: null }));
    render(<FixList fixes={fixes} passed={passed} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Copy HTML/ })));
    expect(screen.getByRole("button", { name: /Copy blocked/ })).toBeTruthy();
  });

  it("fix cards are accessible disclosures: critical open, others closed, aria-controls wired", async () => {
    const { fixes, passed } = analyse(perfectAudit({ title: null, canonical: null }));
    render(<FixList fixes={fixes} passed={passed} />);
    const critical = screen.getByRole("button", { name: /No page title/ });
    const nice = screen.getByRole("button", { name: /No canonical link/ });
    expect(critical.getAttribute("aria-expanded")).toBe("true");
    expect(nice.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(critical.getAttribute("aria-controls")!);
    expect(panel?.textContent).toMatch(/Paste this into your page head/);
    await act(async () => fireEvent.click(nice));
    expect(nice.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(nice.getAttribute("aria-controls")!)?.textContent).toMatch(
      /canonical/,
    );
  });

  it("celebrates a perfect page", () => {
    render(<FixList fixes={[]} passed={["Page loads fine (200)"]} />);
    expect(screen.getByText(/Nothing to fix/)).toBeTruthy();
  });
});

describe("ScoreRing", () => {
  it("shows the score as text for screen readers", () => {
    render(<ScoreRing score={73} />);
    expect(screen.getByText("Score: 73 out of 100")).toBeTruthy();
  });
});
