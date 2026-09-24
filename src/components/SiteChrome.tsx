import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

export function Logo() {
  return (
    <a href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="PreviewProof home">
      <span className="relative inline-flex size-8 items-center justify-center rounded-[10px] bg-gradient-brand shadow-soft">
        <span className="size-3 rounded-[4px] border-2 border-primary-foreground/90" />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">PreviewProof</span>
    </a>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <div className="glass mx-auto flex max-w-5xl items-center justify-between rounded-2xl px-3 py-2 sm:px-4">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <a
            href="#how-it-works"
            className={cn(buttonVariants({ variant: "nav", size: "nav" }), "hidden sm:inline-flex")}
          >
            How it works
          </a>
          <a
            href="#what-we-check"
            className={cn(buttonVariants({ variant: "nav", size: "nav" }), "hidden sm:inline-flex")}
          >
            What we check
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-5xl px-4 pb-10 pt-6">
      <div className="glass flex flex-col items-start justify-between gap-4 rounded-2xl p-5 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <p>
          PreviewProof fetches public pages the way link-preview bots do. We don't store the pages
          you check.
        </p>
        <p className="shrink-0">
          Built with{" "}
          <a
            href="https://lovable.dev"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Lovable
          </a>
        </p>
      </div>
    </footer>
  );
}
