# PreviewProof

**See your link the way the internet sees it.** Paste a public URL and PreviewProof fetches it the way a link-preview bot does, without running JavaScript. It then shows the preview your page produces today on Google, X, LinkedIn, Slack and iMessage/WhatsApp. It scores the page out of 100 and lists what to fix. Each fix comes with a copy-paste HTML snippet and a prompt you can paste straight into Lovable.

Live: https://preview-proof.lovable.app · Built with [Lovable](https://lovable.dev) (TanStack Start on Cloudflare Workers).

## Why it exists

Many apps built with AI tools are single-page apps. Their title, description and Open Graph tags are only set after JavaScript runs. Browsers show them fine, but X, LinkedIn, Slack and WhatsApp never run JavaScript. So every share becomes a bare link, and the builder never finds out. PreviewProof detects that trap specifically, along with the usual preview killers:

- missing or broken `og:image`
- an image URL that isn't an image, or is too heavy for WhatsApp
- placeholder titles such as "Lovable App"
- `noindex`, including via the `X-Robots-Tag` header
- missing `twitter:card`
- relative image URLs
- slow first responses

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

| File                      | Responsibility                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/net-guard.ts`    | SSRF policy: URL validation plus IPv4/IPv6 special-purpose ranges (RFC 6890), including IPv4-mapped, NAT64, 6to4 and Teredo forms |
| `src/lib/audit.server.ts` | Network pipeline. `fetch` and DNS are injected, so it can be tested offline                                                       |
| `src/lib/html.ts`         | Metadata extraction, entity decoding, charset detection, HTML sniffing                                                            |
| `src/lib/analysis.ts`     | Scoring and fix generation. All page text is escaped before it goes into a snippet                                                |
| `src/components/*`        | Preview cards and the fix list                                                                                                    |

## Security

The server fetches URLs that users supply, so it is built to resist SSRF:

- **Target URLs:** only `http`/`https` on ports 80 and 443. URLs containing credentials are rejected, and so are `localhost`, `*.local`, `*.internal` and metadata hostnames.
- **DNS:** before every request, the hostname is resolved over DNS-over-HTTPS. If any A or AAAA record is private, loopback, link-local, CGNAT, documentation, benchmarking or multicast, the request is refused. This covers IPv6 forms that embed an IPv4 address.
- **Redirects:** followed by hand, at most 5 hops. Each `Location` is re-validated and re-resolved.
- **Assets:** the `og:image` and favicon checks go through the same guard, so a hostile page can't point them inward.
- **What gets returned:** only parsed metadata goes back to the browser, never the fetched body. Snippets are HTML-escaped, and React escapes all rendered page text.

**Known limits:**

- There's a small window between the DNS check and the connection, where a hostile DNS server could in theory hand out a different answer. Closing it fully means connecting to the checked IP directly, which the Workers `fetch` API doesn't allow. Workers also can't reach private networks in the first place.
- There's no per-client rate limit yet.

## Development

```sh
bun install
bun run dev          # http://localhost:8080
bun run test         # unit, integration and component tests (Vitest)
bun run test:e2e     # browser tests, desktop + mobile (Playwright)
bun run lint && bun run typecheck && bun run build
```

## Testing

| Suite                  | What it covers                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `net-guard.test.ts`    | 76 cases: private/public IPv4 and IPv6, decimal/hex/octal IP tricks, IPv4-mapped IPv6, NAT64, 6to4, Teredo, schemes, ports, credentials                                                                                                                                                                                                                            |
| `audit.server.test.ts` | Whole pipeline against a fake network: redirect chains, redirects to private targets, DNS rebinding, redirect loops, 8 s and 5 s deadlines (fake timers), including a fetch, DNS lookup or body read that ignores the abort signal, trickling bodies, 2 MB cap, non-HTML responses, `X-Robots-Tag`, Windows-1252 pages, HEAD→ranged-GET fallback, favicon fallback |
| `html.test.ts`         | Parsing edge cases: JS-shell detection that doesn't flag small static pages, tags hidden in comments/scripts/templates, SVG `<title>`, unquoted/upper-case attributes, relative and `javascript:` image URLs, entities, charsets                                                                                                                                   |
| `analysis.test.ts`     | Every rule fires at the right severity, no double-reporting, score floor, HTML escaping of hostile titles                                                                                                                                                                                                                                                          |
| `components.test.tsx`  | Preview fallbacks, hidden broken images, hostile text rendered as text, copy-to-clipboard (including when it's denied)                                                                                                                                                                                                                                             |
| `e2e/app.spec.ts`      | The page's own social tags and OG image, input typed before hydration, every validation error in the UI, empty submit, no horizontal scroll, axe WCAG A/AA                                                                                                                                                                                                         |

The security tests were mutation-checked. Each of the following was re-introduced deliberately, and each one made the suite fail:

- auto-following redirects
- skipping the DNS check
- skipping redirect validation
- dropping the IPv4-mapped IPv6 check
