# PreviewProof

**See your link the way the internet sees it.** Paste a public URL and PreviewProof fetches it the way a link-preview bot does, without running JavaScript. It then shows the preview your page produces today on Google, X, LinkedIn, Slack and iMessage/WhatsApp. It scores the page out of 100 and lists what to fix. Each fix comes with a copy-paste HTML snippet and a prompt you can paste straight into Lovable.

Live: https://preview-proof.lovable.app · Built with [Lovable](https://lovable.dev) (TanStack Start on Cloudflare Workers).

## Why it exists

Many apps built with AI tools are single-page apps. Their title, description and Open Graph tags are only set after JavaScript runs. Browsers show them fine, but X, LinkedIn, Slack and WhatsApp never run JavaScript. So every share becomes a bare link, and the builder never finds out.

Lovable now server-renders new projects (TanStack Start). It also pre-renders older apps for _verified_ crawlers, so for those apps PreviewProof reports the empty shell at lower severity. Its suggested fix is the upgrade to server-side rendering, not a scare. Along with that trap, it checks for the usual preview killers:

- missing or broken `og:image`
- an image URL that isn't an image, or is too heavy for WhatsApp
- placeholder titles such as "Lovable App"
- `noindex`, including via the `X-Robots-Tag` header
- missing `twitter:card`
- relative image URLs
- slow server responses
- stock template share images, such as Lovable's default `opengraph-image`
- firewall bot challenges (Cloudflare "Just a moment…"), which are reported as such rather than graded as if they were your page

## Features

- **Live previews** for Google, X, LinkedIn, Slack and iMessage/WhatsApp, built from your real tags and the fallbacks each platform is known to use. Platforms change their layouts, so these are close previews, not pixel copies.
- **Prioritised fixes:** critical, important and nice-to-have. Each comes with copy-paste HTML and a ready prompt for Lovable.
- **Copy all HTML** merges every head fix into one de-duplicated `<head>` block (heading and `lang` fixes are labelled separately, since they don't go in the head). **Copy one Lovable prompt** turns every fix into a single numbered prompt.
- **Shareable reports:** `/?url=…` re-runs the check when opened, and the address bar updates on every check.
- **Download report** as Markdown.
- **Recent checks,** kept only in your browser.
- **Light and dark themes,** with no flash on load. Animations respect `prefers-reduced-motion`.

## How it works

```
browser ──► auditUrl (server function)
              │
              ├─ validateTargetUrl   scheme, credentials, host, port
              ├─ safeFetch           per hop: DNS-over-HTTPS → every address must be public
              │                      → fetch with redirect: "manual" → re-validate Location
              ├─ readCapped          2 MB cap, 8 s budget, charset-aware decoding
              ├─ parseHtml           head-only title/meta/link, comments + scripts ignored
              └─ checkAsset ×2       og:image and /favicon.ico, through the same guard, 5 s each
          ◄── AuditData ──► analyse() ──► score, prioritised fixes, preview cards
```

| File                      | Responsibility                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/net-guard.ts`    | SSRF policy: URL validation, IPv4 special-purpose ranges (RFC 6890), and an IPv6 allowlist (global unicast only) that also unwraps IPv4-mapped, NAT64 and 6to4 forms |
| `src/lib/audit.server.ts` | Network pipeline. `fetch` and DNS are injected, so it can be tested offline                                                                                          |
| `src/lib/html.ts`         | Metadata extraction, entity decoding, charset detection, HTML sniffing                                                                                               |
| `src/lib/analysis.ts`     | Scoring and fix generation. All page text is escaped before it goes into a snippet                                                                                   |
| `src/lib/report.ts`       | Combined snippet and prompt, Markdown export, share links                                                                                                            |
| `src/components/*`        | Preview cards, fix list, animated score, glass UI (Motion)                                                                                                           |
| `src/components/ui/*`     | shadcn/ui primitives (Button, Badge, Collapsible) extended with `cva` variants. Every button, badge and disclosure in the app is built from them                     |
| `src/styles.css`          | Design tokens (Tailwind v4 `@theme`): colours, radii, shadows, contrast-safe "strong" text tones and each platform's own colours for the preview cards               |

## Styling

Tailwind CSS v4 with shadcn/ui, the stack Lovable generates. The rules the code follows:

- **Tokens, not literals.** Colours come from CSS variables defined once per theme in `styles.css`. There are no hex values or raw palette colours in components; the preview cards' platform colours (Google's link blue, Slack's, iMessage grey) are named tokens too.
- **Primitives with variants, not copied class strings.** Buttons, badges and the fix-card disclosure are shadcn primitives extended with `cva` variants (`brand`, `glass`, `subtle`, `chip`, one badge per severity), and the variant helpers resolve conflicting utilities with `tailwind-merge`.
- **No `!important`**, no inline styles except the few values computed at runtime (the score ring's progress and the backdrop's gradients).
- **Contrast is tested at the token level.** axe can't see text on gradients or translucent glass, so a unit test checks every text/background token pair, including each stop of the brand gradient, against WCAG AA in both themes.

## Security

The server fetches URLs that users supply, so it is built to resist SSRF:

- **Target URLs:** only `http`/`https` on ports 80 and 443. URLs containing credentials are rejected, and so are `localhost`, `*.local`, `*.internal` and metadata hostnames.
- **DNS:** before every request, the hostname is resolved over DNS-over-HTTPS. If any A or AAAA record is private, loopback, link-local, CGNAT, documentation, benchmarking or multicast, or isn't a valid IP address at all, the request is refused. IPv6 is checked as an allowlist: only global unicast (`2000::/3`) outside the special ranges passes, and forms that embed an IPv4 address are checked as that IPv4 address.
- **Redirects:** followed by hand, at most 5 hops. Each `Location` is re-validated and re-resolved.
- **Assets:** the `og:image` and favicon checks go through the same guard, so a hostile page can't point them inward.
- **What gets returned:** only parsed metadata goes back to the browser, never the fetched body. Snippets are HTML-escaped, and React escapes all rendered page text.

**Known limits:**

- There's a small window between the DNS check and the connection, where a hostile DNS server could in theory hand out a different answer. Closing it fully means connecting to the checked IP directly, which the Workers `fetch` API doesn't allow. Workers also can't reach private networks in the first place.
- There's no per-client rate limit yet. Anyone can make the server fetch a public page, from the form or from a shared `?url=` link, which runs the check when opened. The caps (one page, two small asset checks, 8 s, 2 MB) keep each check cheap.

## Development

```sh
bun install
bun run dev          # http://localhost:8080
bun run test         # unit, integration and component tests (Vitest)
bun run test:e2e     # browser tests, desktop + mobile (Playwright)
bun run lint && bun run typecheck && bun run build
npx @lhci/cli@0.14.x autorun   # Lighthouse budgets against the built Worker
```

## Testing

| Suite                  | What it covers                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `net-guard.test.ts`    | Private/public IPv4 and IPv6, decimal/hex/octal IP tricks, IPv4-mapped IPv6, NAT64, 6to4, Teredo, benchmarking and documentation ranges, malformed DNS answers, schemes, ports, credentials                                                                                                                                                                                                                           |
| `audit.server.test.ts` | Whole pipeline against a fake network: redirect chains, redirects to names that resolve privately, redirect loops, 8 s and 5 s deadlines (fake timers), including a fetch, DNS lookup, body read or stream cancel that never settles, trickling bodies, 2 MB cap, response time that excludes our own DNS lookups, non-HTML responses, `X-Robots-Tag`, Windows-1252 pages, HEAD→ranged-GET fallback, favicon fallback |
| `html.test.ts`         | Parsing edge cases: JS-shell detection that doesn't flag small static pages, tags hidden in comments/scripts/templates, `>` inside attribute values, empty tags skipped in favour of the next candidate, SVG `<title>` with or without `</head>`, all HTML 4 named entities, byte-order marks, charsets                                                                                                               |
| `analysis.test.ts`     | Every rule fires at the right severity, redirects with no destination, small vs large X cards, snippet placement, word-boundary trimming, no em dashes in user-facing copy, score floor, HTML escaping of hostile titles                                                                                                                                                                                              |
| `components.test.tsx`  | Preview fallbacks, hidden broken images, hostile text rendered as text, copy-to-clipboard (including when it's blocked, which the button now says), fix cards as accessible disclosures (`aria-expanded`, `aria-controls`)                                                                                                                                                                                            |
| `tokens.test.ts`       | WCAG AA contrast (4.5:1) for every text/background token pair in light and dark themes, including each brand-gradient stop behind button text                                                                                                                                                                                                                                                                         |
| `ui/variants.test.ts`  | Variant helpers resolve conflicting utilities (a size's text and radius beat the base), caller classes win, severity badges use the contrast-safe tokens                                                                                                                                                                                                                                                              |
| `report.test.ts`       | Combined snippet de-duplication (head fixes only), combined prompt, Markdown export (including snippets that contain backticks), share links, recent-checks storage (including corrupt storage)                                                                                                                                                                                                                       |
| `e2e/app.spec.ts`      | The page's own social tags and OG image, input typed before hydration, every validation error in the UI, shareable `?url=` links, dark mode persistence and contrast, reduced motion, empty submit, no horizontal scroll, axe WCAG A/AA. Runs on desktop and mobile                                                                                                                                                   |
| `e2e/results.spec.ts`  | Every results path against a dev-only fake network (`src/test/fake-net.ts`, excluded from production builds): a perfect page, a blank SPA shell, an older Lovable app, a bot challenge, a name that resolves privately, oversized images, very long URLs; copy, share and download actions; exactly one server call per check; axe on the results page in light and dark mode                                         |
| `lighthouserc.json`    | Lighthouse CI against the production Worker build (run locally with Wrangler). The build fails below 90 performance or 100 for accessibility, best practices and SEO, or if CLS goes above 0.05                                                                                                                                                                                                                       |

The key tests were mutation-checked. Each of the following was re-introduced deliberately, and each one made the suite fail:

- auto-following redirects
- skipping the DNS check
- skipping redirect validation
- dropping the IPv4-mapped IPv6 check
- awaiting a stream cancel that never settles
- running the same check twice on the first submit
