import { describe, expect, it } from "vitest";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { theaterTitleLabel } from "./theaterTitleLabel";

describe("theater title", () => {
  it("joins the existing heading, camera date, time and authorized position", () => {
    const detail = makeItemDetail({
      altTextOverride: "Taking the long way home",
      capturedAt: "2026-09-15T20:28:00.000Z",
      capturedOn: "2026-09-15",
      capturedAtOffsetMinutes: -240,
    });
    expect(
      theaterTitleLabel({
        detail,
        timezone: "Asia/Tokyo",
        position: { position: 4, total: 4 },
      }),
    ).toBe(
      "A photograph from 15 September 2026 · September 15 · 4:28 pm · 4/4",
    );
  });
  it("uses the instance timezone when no camera offset exists, including day rollover", () => {
    const detail = makeItemDetail({
      altTextOverride: "Night walk",
      capturedAt: "2026-09-16T00:28:00.000Z",
      capturedOn: "2026-09-15",
      capturedAtOffsetMinutes: null,
    });
    expect(
      theaterTitleLabel({
        detail,
        timezone: "America/New_York",
        position: null,
      }),
    ).toBe("A photograph from 15 September 2026 · September 15 · 8:28 pm");
  });
  it("falls back to itemHeading and omits a missing counter", () => {
    const detail = makeItemDetail({ altTextOverride: "   " });
    expect(
      theaterTitleLabel({ detail, timezone: "UTC", position: undefined }),
    ).toBe("A photograph from 14 September 2026 · September 14 · 6:41 am");
  });
});
