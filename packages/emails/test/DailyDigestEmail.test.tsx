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

it.each([1, 2, 3, 4, 5, 6, 7])(
  "renders each nonempty section combination %s in both formats",
  async (combination) => {
    const hasUploads = (combination & 1) !== 0;
    const hasComments = (combination & 2) !== 0;
    const hasTags = (combination & 4) !== 0;
    const comments = {
      totalEvents: 1,
      entries: [
        {
          sourceId: "comment",
          itemId: "item",
          authorDisplayName: "Ana & Rosa",
          excerpt: "Family <3",
          url: "https://shoebox.example/items/item?comment=comment",
        },
      ],
    };
    const result = await templates.dailyDigestEmail.render({
      shoeboxName: "Family",
      baseUrl: "https://shoebox.example",
      timezone: "UTC",
      toDisplayName: null,
      preferencesUrl: "https://shoebox.example/account",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-02",
      shoeboxUrl: "https://shoebox.example",
      uploads: hasUploads
        ? {
            totalEvents: 1,
            totalVisibleItems: 2,
            entries: [
              {
                sourceId: "upload",
                uploaderDisplayName: "Ana",
                visibleItemCount: 2,
                url: "https://shoebox.example/?at=2026-11-01",
              },
            ],
          }
        : { totalEvents: 0, totalVisibleItems: 0, entries: [] },
      comments: hasComments ? comments : { totalEvents: 0, entries: [] },
      commentTags: hasTags ? comments : { totalEvents: 0, entries: [] },
    });
    for (const content of [
      result.html.toLowerCase(),
      result.text.toLowerCase(),
    ]) {
      expect(content.includes("new photos/videos")).toBe(hasUploads);
      expect(content.includes("comments and replies")).toBe(hasComments);
      expect(content.includes("comment tags")).toBe(hasTags);
      expect(content).toContain("2026-11-01 to 2026-11-02");
      expect(content).toContain("https://shoebox.example/account");
    }
  },
);
