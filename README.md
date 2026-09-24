# preview-proof

Build "PreviewProof": a tool for people who built an app with Lovable and want it to spread. You paste a public URL and see how your app will look when someone shares it or finds it on Google, what's broken, and exactly how to fix it. BACKEND: use Lovable Cloud with an edge function called audit. It accepts a URL, allows only http/https, rejects localhost, private and link-local IP ranges and non-standard ports (SSRF protection), uses an 8 second timeout and caps the download at 2 MB. It fetches the raw HTML the way a link-preview bot would (no JavaScript execution, user agent PreviewProofBot/1.0) and extracts: final URL after redirects, HTTP status, response time, title, meta description, canonical, robots meta (flag noindex), html lang, favicon, count of h1, og:title, og:description, og:image, og:url, og:type, twitter:card, twitter:title, twitter:image. For og:image, make a HEAD request to check it resolves and record content-type and size. Detect the single-page-app trap: if the body is essentially an empty root div and the title/description are generic or missing, flag that per-page tags are probably only set after JavaScript runs, so X, LinkedIn, Slack and WhatsApp previews won't see them. FRONTEND (React, clean, friendly, mobile-first): a hero with one URL input and a Check my app button; a results view with a score out of 100 and realistic mock previews side by side for a Google search result, an X card, a LinkedIn post, a Slack unfurl and an iMessage/WhatsApp link, each using the extracted data and showing the platform's real fallback when a field is missing; then a prioritised fix list (critical, important, nice to have) where each fix has a plain-English reason it matters for traffic, a copy-paste HTML snippet, and a Fix it in Lovable prompt the user can paste into their own Lovable project, each with a copy button. Include loading and clear error states (bad URL, timeout, blocked host). Give the PreviewProof page itself perfect SEO and social tags.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4e6147cc-e63a-4406-8c16-deba6eb2494e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
