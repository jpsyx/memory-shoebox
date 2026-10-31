import { expect, it } from "vitest";
import type { CommentTagEmailPayload } from "@memory-shoebox/shared";
import * as templates from "../src/index.ts";

it("registers comment-tag copy with equivalent safe photo/video and moment content", async () => {
  expect(templates).toHaveProperty("commentTagEmail");
  const template = templates.commentTagEmail;
  const base: CommentTagEmailPayload = {
    shoeboxName: "Shoebox",
    baseUrl: "https://shoebox.example",
    timezone: "Pacific/Kiritimati",
    toDisplayName: "Jorge",
    preferencesUrl: "https://shoebox.example/account?email=comment-tag",
    authorDisplayName: "Ana",
    body: "@Jorge <script>bad</script>\nSecond line",
    itemCapturedOn: "2026-09-27",
    itemUrl: "https://shoebox.example/items/123?comment=456",
    itemKind: "photo",
    atSeconds: null,
  };
  expect(template.subject(base)).toBe("Ana tagged you in a comment.");
  for (const [itemKind, atSeconds] of [
    ["photo", null],
    ["video", null],
    ["video", 18],
  ] as const) {
    const result = await template.render({ ...base, itemKind, atSeconds });
    const text = result.text.replace(/\s+/g, " ");
    expect(text).toContain(`On a ${itemKind} from 27 September 2026.`);
    expect(text).toContain("View comment");
    expect(text).toContain(
      "You're receiving this because Ana tagged you in a comment.",
    );
    expect(text).toContain("Change comment-tag emails");
    expect(result.text).toContain(base.itemUrl);
    expect(result.text).toContain("Second line");
    expect(result).toMatchSnapshot(`${itemKind}-${atSeconds ?? "unanchored"}`);
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<img");
    expect(result.html).not.toContain("<script>");
    if (atSeconds !== null) {
      expect(text).toContain("At 0:18");
    }
  }
});
