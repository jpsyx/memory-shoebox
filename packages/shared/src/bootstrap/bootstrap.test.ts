import { expect, it } from "vitest";
import { bootstrapResponseSchema } from "./bootstrap.ts";

it("accepts anonymous availability but rejects incomplete or invalid authority payloads", () => {
  expect(
    bootstrapResponseSchema.parse({
      setup: { isRequired: true },
      account: null,
      progress: null,
    }),
  ).toEqual({ setup: { isRequired: true }, account: null, progress: null });
  expect(
    bootstrapResponseSchema.safeParse({ setup: { isRequired: false } }).success,
  ).toBe(false);
  expect(
    bootstrapResponseSchema.safeParse({
      setup: { isRequired: false },
      account: { me: { role: "admin" } },
      progress: null,
    }).success,
  ).toBe(false);
  expect(
    bootstrapResponseSchema.safeParse({
      setup: { isRequired: false },
      account: null,
      progress: { needsInvitations: "yes" },
    }).success,
  ).toBe(false);
});
