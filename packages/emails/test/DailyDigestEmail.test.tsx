import { expect, it } from "vitest";
import * as templates from "../src/index.ts";

it("renders only populated sections, safe excerpts, totals and account links", async () => {
  expect(templates).toHaveProperty("dailyDigestEmail");
  const result = await templates.dailyDigestEmail.render({
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
      totalEvents: 21,
      entries: [
        {
          sourceId: "comment",
          itemId: "item",
          authorDisplayName: "Ana",
          excerpt: "<script>unsafe</script>",
          url: "https://shoebox.example/items/item?comment=comment",
        },
      ],
    },
    commentTags: { totalEvents: 0, entries: [] },
  });
  expect(result.text.toLowerCase()).toContain("comments and replies");
  expect(result.text).toContain("21");
  expect(result.text.toLowerCase()).not.toContain("comment tags");
  expect(result.html).not.toContain("<script>");
  expect(result.html).toContain("&lt;script&gt;");
  expect(result.text).toContain("https://shoebox.example/account");
});
