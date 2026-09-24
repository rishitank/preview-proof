import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Rendered as a <span> (not shadcn's default <div>) so a badge is valid inside buttons,
 * headings and paragraphs.
 */
const badgeVariantsBase = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-border bg-secondary/70 text-secondary-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive-strong",
        outline: "text-foreground",
        /** Fix severities. Text uses the "strong" tokens so it stays readable on the tint. */
        critical: "border-destructive/30 bg-destructive/10 text-destructive-strong",
        important: "border-warning/40 bg-warning/15 text-warning-strong",
        nice: "border-border bg-secondary text-secondary-foreground",
      },
      size: {
        default: "",
        sm: "px-2 py-0.5 text-[11px] font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/** Class names for a badge, with conflicting utilities resolved (a size's text-[11px] beats the base text-xs). */
const badgeVariants = (...args: Parameters<typeof badgeVariantsBase>) =>
  cn(badgeVariantsBase(...args));

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariantsBase> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
