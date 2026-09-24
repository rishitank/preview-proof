import { motion } from "motion/react";
import { Globe, ImageOff, MessageCircle, Link2 } from "lucide-react";
import type { AuditData } from "@/lib/audit-types";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function pathOf(url: string) {
  try {
    const u = new URL(url);
    return u.pathname === "/"
      ? ""
      : u.pathname.replace(/\/$/, "").split("/").filter(Boolean).join(" › ");
  } catch {
    return "";
  }
}

function Fallback({ children }: { children: React.ReactNode }) {
  return <span className="italic text-muted-foreground">{children}</span>;
}

function usableImage(d: AuditData, url: string | null) {
  if (!url) return null;
  if (d.ogImage && url === d.ogImage && d.ogImageCheck && !d.ogImageCheck.ok) return null;
  return url;
}

function Shell({
  name,
  note,
  children,
}: {
  name: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <h3 className="font-display text-sm font-bold">{name}</h3>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      <div className="bg-muted/50 p-4">{children}</div>
    </div>
  );
}

function ImageBox({ src, ratio = "aspect-[1.91/1]" }: { src: string | null; ratio?: string }) {
  if (!src) {
    return (
      <div
        className={`flex ${ratio} w-full items-center justify-center gap-2 bg-secondary text-xs text-muted-foreground`}
      >
        <ImageOff className="size-4" />
        No image — platform shows a text-only link
      </div>
    );
  }
  return (
    <img
      src={src}
      alt="Social preview"
      className={`${ratio} w-full bg-secondary object-cover`}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

/* ---------------- Google ---------------- */
function GoogleResult({ d }: { d: AuditData }) {
  const site = hostOf(d.finalUrl);
  const crumb = pathOf(d.finalUrl);
  const title = d.title ?? d.ogTitle;
  const desc = d.description ?? d.ogDescription;

  return (
    <Shell
      name="Google search result"
      note={
        d.noindex
          ? "Blocked: this page asks not to be indexed"
          : "Uses <title> and meta description"
      }
    >
      <div className="rounded-xl bg-surface p-4">
        {d.noindex ? (
          <p className="text-sm text-destructive">
            This page won't appear in Google at all — it carries a “noindex” instruction.
          </p>
        ) : (
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center overflow-hidden rounded-full border border-border bg-surface">
                {d.favicon ? (
                  <img
                    src={d.favicon}
                    alt=""
                    className="size-4 object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Globe className="size-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-xs font-medium text-foreground">{site}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {site}
                  {crumb ? ` › ${crumb}` : ""}
                </div>
              </div>
            </div>
            <p className="mt-2 line-clamp-1 text-lg text-[#1a0dab] underline-offset-2 hover:underline dark:text-[#8ab4f8]">
              {title ?? <Fallback>{site}</Fallback>}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {desc ?? (
                <Fallback>
                  Google guesses a snippet from whatever text it finds on the page — often the wrong
                  sentence.
                </Fallback>
              )}
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}

/* ---------------- X ---------------- */
function XCard({ d }: { d: AuditData }) {
  const site = hostOf(d.finalUrl);
  const img = usableImage(d, d.twitterImage ?? d.ogImage);
  const large = d.twitterCard === "summary_large_image" && !!img;
  const title = d.twitterTitle ?? d.ogTitle ?? d.title;

  if (!d.twitterCard && !d.ogTitle && !img) {
    return (
      <Shell name="X (Twitter)" note="No card tags — posts as a bare link">
        <div className="rounded-xl bg-surface p-4 text-sm">
          <p className="text-foreground">Just shipped something new →</p>
          <p className="mt-1 break-all text-[#1d9bf0]">{d.finalUrl}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            No preview card appears. The link sits in the post as plain blue text.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      name="X (Twitter)"
      note={large ? "Large image card" : img ? "Small thumbnail card" : "Text-only card"}
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {large ? (
          <>
            <ImageBox src={img} />
            <div className="border-t border-border p-3">
              <p className="text-xs text-muted-foreground">{site}</p>
              <p className="mt-0.5 line-clamp-1 text-sm font-medium">
                {title ?? <Fallback>{site}</Fallback>}
              </p>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {d.ogDescription ?? d.description ?? (
                  <Fallback>No description — X leaves this line blank.</Fallback>
                )}
              </p>
            </div>
          </>
        ) : (
          <div className="flex">
            <div className="w-24 shrink-0 sm:w-32">
              <ImageBox src={img} ratio="aspect-square" />
            </div>
            <div className="min-w-0 p-3">
              <p className="text-xs text-muted-foreground">{site}</p>
              <p className="mt-0.5 line-clamp-1 text-sm font-medium">
                {title ?? <Fallback>{site}</Fallback>}
              </p>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {d.ogDescription ?? d.description ?? <Fallback>No description shown.</Fallback>}
              </p>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

/* ---------------- LinkedIn ---------------- */
function LinkedInPost({ d }: { d: AuditData }) {
  const site = hostOf(d.finalUrl);
  const img = usableImage(d, d.ogImage);
  const title = d.ogTitle ?? d.title;

  return (
    <Shell name="LinkedIn post" note={img ? "Image card" : "No image — small grey card"}>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <ImageBox src={img} />
        <div className="p-3">
          <p className="line-clamp-2 text-sm font-semibold">
            {title ?? <Fallback>{d.finalUrl}</Fallback>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{site}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        LinkedIn ignores the description in feed posts — the title and image do all the work.
      </p>
    </Shell>
  );
}

/* ---------------- Slack ---------------- */
function SlackUnfurl({ d }: { d: AuditData }) {
  const site = hostOf(d.finalUrl);
  const img = usableImage(d, d.ogImage);
  const title = d.ogTitle ?? d.title;

  return (
    <Shell name="Slack unfurl" note="Reads Open Graph tags">
      <div className="rounded-lg bg-surface p-3">
        <div className="border-l-4 border-primary pl-3">
          <div className="flex items-center gap-2">
            {d.favicon ? (
              <img
                src={d.favicon}
                alt=""
                className="size-4 rounded-sm object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Globe className="size-4 text-muted-foreground" />
            )}
            <span className="text-xs font-semibold">{site}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#1264a3] dark:text-[#7cc3ff]">
            {title ?? <Fallback>{d.finalUrl}</Fallback>}
          </p>
          <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">
            {d.ogDescription ?? d.description ?? (
              <Fallback>Nothing here — Slack shows just the link and a colour bar.</Fallback>
            )}
          </p>
          {img ? (
            <img
              src={img}
              alt="Slack preview"
              className="mt-2 max-h-40 w-full rounded-md object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- iMessage / WhatsApp ---------------- */
function ChatBubble({ d }: { d: AuditData }) {
  const site = hostOf(d.finalUrl);
  const img = usableImage(d, d.ogImage);
  const title = d.ogTitle ?? d.title;
  const heavy = d.ogImageCheck?.bytes != null && d.ogImageCheck.bytes > 600 * 1024;

  return (
    <Shell
      name="iMessage & WhatsApp"
      note={img && !heavy ? "Rich link bubble" : "Compact text link"}
    >
      <div className="flex justify-end">
        <div className="w-full max-w-xs overflow-hidden rounded-2xl bg-[#e9e9eb] text-[#111] shadow-sm dark:bg-secondary dark:text-foreground">
          {img && !heavy ? (
            <ImageBox src={img} />
          ) : (
            <div className="flex aspect-[3/1] items-center justify-center bg-[#d7d7db] dark:bg-muted">
              <Link2 className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="p-3">
            <p className="line-clamp-2 text-sm font-medium">
              {title ?? <Fallback>{site}</Fallback>}
            </p>
            <p className="line-clamp-1 text-xs opacity-70">
              {d.ogDescription ?? d.description ?? "No description"}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-wide opacity-60">{site}</p>
          </div>
        </div>
      </div>
      {heavy ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground">
          <MessageCircle className="mt-0.5 size-3.5 shrink-0" />
          Your image is over 600 KB, so WhatsApp will likely skip it and send the plain link.
        </p>
      ) : null}
    </Shell>
  );
}

export function PreviewCards({ data }: { data: AuditData }) {
  return (
    <motion.div
      className="grid items-start gap-4 md:grid-cols-2"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.07 } } }}
    >
      {[
        <GoogleResult key="g" d={data} />,
        <XCard key="x" d={data} />,
        <LinkedInPost key="li" d={data} />,
        <SlackUnfurl key="s" d={data} />,
        <ChatBubble key="c" d={data} />,
      ].map((cardEl, i) => (
        <motion.div
          key={i}
          className={i === 4 ? "md:col-span-2" : undefined}
          variants={{
            hidden: { opacity: 0, y: 14 },
            show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
          }}
        >
          {cardEl}
        </motion.div>
      ))}
    </motion.div>
  );
}
