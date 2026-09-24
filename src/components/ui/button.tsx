import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Every button and button-styled link in the app comes from these variants.
 * Focus styling is left to the global :focus-visible outline in styles.css, so keyboard focus
 * looks the same on every control.
 */
const buttonVariantsBase = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        /** The main call to action: brand gradient. */
        brand:
          "bg-gradient-brand font-semibold text-primary-foreground shadow-soft disabled:opacity-60",
        /** Secondary actions sitting on glass surfaces. */
        glass: "border border-border bg-surface/70 hover:bg-secondary",
        /** Small, quiet controls: copy buttons and the theme toggle. */
        subtle:
          "border border-border bg-surface text-muted-foreground hover:bg-secondary hover:text-foreground",
        /** Suggestion and recent-check chips under the search box. */
        chip: "border border-border bg-surface/60 text-foreground hover:bg-secondary",
        /** Header navigation links. */
        nav: "text-muted-foreground hover:text-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        cta: "h-auto rounded-xl px-5 py-3 text-base",
        action: "h-auto rounded-xl px-3 py-2",
        compact: "h-auto gap-1.5 rounded-lg px-2.5 py-1.5 text-xs [&_svg]:size-3.5",
        chip: "h-auto gap-1 rounded-full px-2.5 py-1 text-xs",
        nav: "h-auto rounded-lg px-3 py-2",
        "icon-lg": "size-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/** Class names for a button, with conflicting utilities resolved (a size's text-base beats the base text-sm). */
const buttonVariants = (...args: Parameters<typeof buttonVariantsBase>) =>
  cn(buttonVariantsBase(...args));

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariantsBase> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={buttonVariants({ variant, size, className })} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
