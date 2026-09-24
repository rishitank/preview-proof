import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AuditResponse } from "./audit-types";
import { runAudit } from "./audit.server";

export const auditUrl = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ url: z.string().trim().min(1).max(2048) }).parse(data))
  .handler(({ data }): Promise<AuditResponse> => runAudit(data.url));
