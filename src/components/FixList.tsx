import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ChevronDown, CircleAlert, Sparkles, CheckCircle2 } from "lucide-react";
import { CopyButton } from "./CopyButton";
import type { Fix, Severity } from "@/lib/analysis";

const META: Record<
  Severity,
  { label: string; blurb: string; className: string; Icon: typeof AlertTriangle }
> = {
  critical: {
    label: "Critical",
    blurb: "Fix these first: they're costing you clicks right now.",
    className: "bg-destructive/10 text-red-700 border-destructive/30 dark:text-red-300",
    Icon: AlertTriangle,
  },
  important: {
    label: "Important",
    blurb: "Worth doing this week.",
    className: "bg-warning/15 text-amber-800 border-warning/40 dark:text-amber-200",
    Icon: CircleAlert,
  },
  nice: {
    label: "Nice to have",
    blurb: "Small polish once the big ones are done.",
    className: "bg-secondary text-secondary-foreground border-border",
    Icon: Sparkles,
  },
};

function FixCard({ fix }: { fix: Fix }) {
  const [open, setOpen] = useState(fix.severity === "critical");
  const { Icon, label, className } = META[fix.severity];

  return (
    <div className="surface-card overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span
          className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
        >
          <Icon className="size-3" />
          {label}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-semibold">{fix.title}</span>
          <span className="mt-1 block text-sm text-muted-foreground">{fix.why}</span>
        </span>
        <ChevronDown
          className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-border bg-muted/40 p-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Paste this into your page head
                  </h4>
                  <CopyButton value={fix.snippet} label="Copy HTML" />
                </div>
                <pre
                  tabIndex={0}
                  aria-label="HTML snippet"
                  className="overflow-x-auto rounded-lg bg-surface p-3 text-xs leading-relaxed"
                >
                  <code>{fix.snippet}</code>
                </pre>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Or fix it in Lovable
                  </h4>
                  <CopyButton value={fix.prompt} label="Copy prompt" />
                </div>
                <p className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-sm">
                  {fix.prompt}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function FixList({ fixes, passed }: { fixes: Fix[]; passed: string[] }) {
  const groups: Severity[] = ["critical", "important", "nice"];

  return (
    <div className="space-y-8">
      {fixes.length === 0 ? (
        <div className="surface-card p-6 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success" />
          <p className="mt-2 font-display text-lg font-semibold">Nothing to fix. Go share it.</p>
        </div>
      ) : null}

      {groups.map((sev) => {
        const items = fixes.filter((f) => f.severity === sev);
        if (!items.length) return null;
        return (
          <section key={sev} className="space-y-3">
            <div>
              <h3 className="font-display text-xl font-bold">
                {META[sev].label} <span className="text-muted-foreground">({items.length})</span>
              </h3>
              <p className="text-sm text-muted-foreground">{META[sev].blurb}</p>
            </div>
            <div className="space-y-3">
              {items.map((f) => (
                <FixCard key={f.id} fix={f} />
              ))}
            </div>
          </section>
        );
      })}

      {passed.length ? (
        <section>
          <h3 className="font-display text-xl font-bold">Already good</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {passed.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                {p}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
