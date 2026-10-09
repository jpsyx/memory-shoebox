import { describe, expect, it } from "vitest";
import * as shared from "../src/index.ts";

describe("person rename requests", () => {
  it("trims names and rejects blank or overlong replacements", () => {
    expect(shared).toHaveProperty("renamePersonRequestSchema");
    expect(
      shared.renamePersonRequestSchema.parse({ displayName: "  Ana  " }),
    ).toEqual({ displayName: "Ana" });
    expect(
      shared.renamePersonRequestSchema.safeParse({ displayName: "  " }).success,
    ).toBe(false);
    expect(
      shared.renamePersonRequestSchema.safeParse({
        displayName: "a".repeat(81),
      }).success,
    ).toBe(false);
  });
});
