import { describe, expect, it, vi } from "vitest";
import { makeFormatterCacheByZone } from "../../src/time/formatterCacheByZone.ts";

describe("makeFormatterCacheByZone", () => {
  it("builds one zone's formatter once, and reuses it on the next lookup", () => {
    const makeFormatter = vi.fn((timezone: string) => {
      return new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    });
    const lookup = makeFormatterCacheByZone(makeFormatter);

    const first = lookup("Europe/Madrid");
    const second = lookup("Europe/Madrid");

    expect(second).toBe(first);
    expect(makeFormatter).toHaveBeenCalledTimes(1);
  });

  it("builds a separate formatter for each distinct zone", () => {
    const makeFormatter = vi.fn((timezone: string) => {
      return new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    });
    const lookup = makeFormatterCacheByZone(makeFormatter);

    const madrid = lookup("Europe/Madrid");
    const losAngeles = lookup("America/Los_Angeles");

    expect(madrid).not.toBe(losAngeles);
    expect(makeFormatter).toHaveBeenCalledTimes(2);
    expect(makeFormatter).toHaveBeenNthCalledWith(1, "Europe/Madrid");
    expect(makeFormatter).toHaveBeenNthCalledWith(2, "America/Los_Angeles");
  });
});
