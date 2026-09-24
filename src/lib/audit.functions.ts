import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AuditResponse } from "./audit-types";
import { runAudit } from "./audit.server";

export const auditUrl = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ url: z.string().trim().min(1).max(2048) }).parse(data))
  .handler(async ({ data }): Promise<AuditResponse> => {
    // Dev-only test hook: `import.meta.env.DEV` is false in production builds, so this
    // branch and the fake network are removed from the deployed bundle entirely.
    if (
      import.meta.env.DEV &&
      typeof process !== "undefined" &&
      process.env["PREVIEWPROOF_FAKE_NET"] === "1"
    ) {
      const { fakeDeps } = await import("../test/fake-net");
      return runAudit(data.url, fakeDeps());
    }
    return runAudit(data.url);
  });
