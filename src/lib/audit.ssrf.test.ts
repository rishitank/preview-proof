// Run with: bun test src/lib/audit.ssrf.test.ts
import { expect, test } from "bun:test";
import { areResolvedAddressesSafe } from "./audit.functions";

test("public addresses pass, any private address blocks", () => {
  expect(areResolvedAddressesSafe(["93.184.216.34", "2606:2800:220:1::1"])).toBe(true);
  expect(areResolvedAddressesSafe(["93.184.216.34", "10.0.0.5"])).toBe(false);
  expect(areResolvedAddressesSafe(["169.254.169.254"])).toBe(false);
  expect(areResolvedAddressesSafe(["::ffff:127.0.0.1"])).toBe(false);
  expect(areResolvedAddressesSafe(["fd00::1"])).toBe(false);
  expect(areResolvedAddressesSafe([])).toBe(false);
});
