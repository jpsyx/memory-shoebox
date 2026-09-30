import { describe, expect, it } from "vitest";
import type { CommentEmailPayload } from "@memory-shoebox/shared";
import { commentEmail } from "../src/templates/CommentEmail.tsx";

const BASE: CommentEmailPayload = {
  shoeboxName: "The Shoebox",
  baseUrl: "https://shoebox.example.com",
  timezone: "Europe/Madrid",
  toDisplayName: "Andrés",
  preferencesUrl: "https://shoebox.example.com/account",
  authorDisplayName: "Abuela Rosa",
  body: "He has your father's chin.",
  atSeconds: null,
  itemCapturedOn: "2026-09-14",
  itemUrl: "https://shoebox.example.com/item/4620",
  relation: "uploader",
  uploaderDisplayName: "Andrés",
};

describe("commentEmail", () => {
  it("tells the uploader it is one of their photos", async () => {
    const rendered = await commentEmail.render(BASE);

    expect(commentEmail.subject(BASE)).toBe(
      "Abuela Rosa wrote on one of your photos",
    );
    expect(rendered.text).toContain("He has your father's chin.");
    expect(rendered.text).toContain("You are getting this because you put the");
  });

  it("never tells a prior commenter it is one of their photos", async () => {
    const payload: CommentEmailPayload = {
      ...BASE,
      toDisplayName: "Abuela Rosa",
      authorDisplayName: "Tía Marisol",
      relation: "commenter",
      uploaderDisplayName: "Papá",
    };

    const rendered = await commentEmail.render(payload);

    expect(commentEmail.subject(payload)).toBe(
      "Tía Marisol has written on that photo too",
    );
    expect(rendered.text).not.toContain("one of your photos");
    expect(rendered.text).not.toContain("you put the photo up");
    expect(rendered.text).toContain("Papá put it up");
    expect(rendered.text).toContain("you wrote on it too");
  });

  it("quotes the comment, because a reader who never opens the link reads it here", async () => {
    const rendered = await commentEmail.render(BASE);

    expect(rendered.html).toContain("He has your father&#x27;s chin.");
  });
});
