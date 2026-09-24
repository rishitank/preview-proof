/** Per-browser list of recently checked URLs. Storage can be missing or throw; never let it break the page. */
const KEY = "previewproof:recent";
const MAX = 5;

export type RecentCheck = { url: string; score: number; at: number };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadRecent(): RecentCheck[] {
  try {
    const raw = storage()?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is RecentCheck =>
          !!r &&
          typeof r.url === "string" &&
          typeof r.score === "number" &&
          typeof r.at === "number",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveRecent(entry: RecentCheck): RecentCheck[] {
  const next = [entry, ...loadRecent().filter((r) => r.url !== entry.url)].slice(0, MAX);
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode or quota: keep it in memory only */
  }
  return next;
}

export function clearRecent(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
