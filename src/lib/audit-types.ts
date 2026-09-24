export type ImageCheck = {
  ok: boolean;
  status?: number;
  contentType?: string | null;
  bytes?: number | null;
  error?: string;
};

export type AuditData = {
  requestedUrl: string;
  finalUrl: string;
  redirected: boolean;
  status: number;
  responseTimeMs: number;
  contentType: string | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  noindex: boolean;
  lang: string | null;
  favicon: string | null;
  h1Count: number;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  ogType: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterImage: string | null;
  ogImageCheck: ImageCheck | null;
  bodyTextLength: number;
  emptyRootDiv: boolean;
  spaTrap: boolean;
  htmlBytes: number;
  truncated: boolean;
};

export type AuditError = {
  code:
    | "invalid_url"
    | "blocked_host"
    | "blocked_port"
    | "timeout"
    | "fetch_failed"
    | "not_html";
  message: string;
};

export type AuditResponse =
  | { ok: true; data: AuditData }
  | { ok: false; error: AuditError };
