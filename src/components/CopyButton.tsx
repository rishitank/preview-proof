import { useEffect, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type State = "idle" | "copied" | "failed";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <Button
      type="button"
      variant="subtle"
      size="compact"
      className="shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          // Clipboard blocked (permissions, insecure context): say so instead of failing silently.
          setState("failed");
        }
      }}
    >
      {state === "copied" ? (
        <Check className="text-success" aria-hidden />
      ) : state === "failed" ? (
        <X className="text-destructive-strong" aria-hidden />
      ) : (
        <Copy aria-hidden />
      )}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy blocked" : label}
    </Button>
  );
}
