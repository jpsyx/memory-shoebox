import { describe, expect, it } from "vitest";
import { makeAltTextFromItem } from "../../src/archive/makeAltTextFromItem.ts";

const CAPTURED_AT = "2026-09-14T21:30:00.000Z";

describe("makeAltTextFromItem", () => {
  it("is the date alone with nobody tagged", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: null,
        personNames: [],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("14 September 2026");
  });

  it("names one person before the date", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: null,
        personNames: ["Mateo"],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("Mateo, 14 September 2026");
  });

  it("joins the rest with commas and a final and", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: null,
        personNames: ["Mateo", "Papá", "Mamá"],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("Mateo, Papá and Mamá, 14 September 2026");
  });

  it("renders the date in the Shoebox's zone, not the server's", () => {
    // 21:30 UTC on the 14th is already the 15th in Sydney.
    expect(
      makeAltTextFromItem({
        altTextOverride: null,
        personNames: [],
        capturedAt: CAPTURED_AT,
        timezone: "Australia/Sydney",
      }),
    ).toBe("15 September 2026");
  });

  it("lets a typed description win outright", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: "Mateo asleep on his father's chest",
        personNames: ["Mateo"],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("Mateo asleep on his father's chest");
  });

  it("treats a blank override as no override", () => {
    expect(
      makeAltTextFromItem({
        altTextOverride: "   ",
        personNames: [],
        capturedAt: CAPTURED_AT,
        timezone: "Europe/Madrid",
      }),
    ).toBe("14 September 2026");
  });
});
