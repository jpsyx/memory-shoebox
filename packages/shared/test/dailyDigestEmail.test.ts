import { expect, it } from "vitest";
import * as shared from "../src/index.ts";

it("accepts three frequencies and rejects weekly and legacy boolean choices", () => {
  expect(shared).toHaveProperty("notificationFrequencySchema");
  for (const value of ["off", "immediate", "daily"])
    expect(shared.notificationFrequencySchema.safeParse(value).success).toBe(
      true,
    );
  for (const value of ["weekly", true, false])
    expect(shared.notificationFrequencySchema.safeParse(value).success).toBe(
      false,
    );
});

it("requires a nonempty digest and bounds comment excerpts by Unicode characters", () => {
  expect(shared).toHaveProperty("dailyDigestEmailPayloadSchema");
  const payload = {
    shoeboxName: "Family",
    baseUrl: "https://shoebox.example",
    timezone: "UTC",
    toDisplayName: null,
    preferencesUrl: "https://shoebox.example/account",
    periodStart: "2026-11-02",
    periodEnd: "2026-11-02",
    shoeboxUrl: "https://shoebox.example",
    uploads: { totalEvents: 0, totalVisibleItems: 0, entries: [] },
    comments: {
      totalEvents: 1,
      entries: [
        {
          sourceId: "comment",
          itemId: "item",
          authorDisplayName: "Ana",
          excerpt: "😀".repeat(200),
          url: "https://shoebox.example/items/item?comment=comment",
        },
      ],
    },
    commentTags: { totalEvents: 0, entries: [] },
  };
  expect(shared.dailyDigestEmailPayloadSchema.safeParse(payload).success).toBe(
    true,
  );
  expect(
    shared.dailyDigestEmailPayloadSchema.safeParse({
      ...payload,
      comments: { totalEvents: 0, entries: [] },
    }).success,
  ).toBe(false);
  payload.comments.entries[0]!.excerpt += "x";
  expect(shared.dailyDigestEmailPayloadSchema.safeParse(payload).success).toBe(
    false,
  );
});
