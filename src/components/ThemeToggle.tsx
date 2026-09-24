import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "previewproof:theme";

export const THEME_COLORS = { light: "#fcfaf1", dark: "#081619" } as const;

/** Keeps the browser UI colour (mobile address bar) in step with the page theme. */
function syncThemeColor(dark: boolean) {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

/** Runs before first paint (inlined in <head>) so there's no flash of the wrong theme. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"${THEME_COLORS.dark}":"${THEME_COLORS.light}")}catch(e){}})();`;

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDark(isDark);
    syncThemeColor(isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    syncThemeColor(next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-surface/60 text-muted-foreground transition-colors hover:text-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
