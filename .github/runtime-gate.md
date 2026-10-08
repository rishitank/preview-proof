# Runtime gate hints: preview-proof

PreviewProof is a single-page tool (TanStack Start on a Cloudflare Worker).
A visitor pastes a public URL; the server fetches it the way link-preview
bots do and shows the Google / X / LinkedIn / Slack / WhatsApp previews it
would produce, a score, and copy-paste fixes. There are no accounts.

Flows that matter most:

1. `/` renders the hero, the URL form, the "Try:" example chips and the
   "How it works" landing section. The header's "How it works" links scroll
   to it.
2. Theme toggle in the header switches light/dark without layout jumps.
3. Form validation: submitting empty is blocked; an invalid value such as
   `not a url` or a private address such as `http://127.0.0.1` or
   `http://10.0.0.1` must show a friendly "We couldn't check that link"
   message, never a crash or a blank panel.
4. A missing path (e.g. `/nope`) shows the 404 page with a working
   "Go home" link.

In CI the server has no reliable outbound network and this production build
does not use the e2e fake network, so a real public URL may come back as
"We couldn't check that link" (fetch failed / timeout). That message is the
correct behaviour, not a bug. A spinner that never ends, an uncaught error
or "Something went wrong" is a bug.

Do NOT: submit more than a handful of checks, or use internal/metadata
addresses other than the loopback/private examples above.
