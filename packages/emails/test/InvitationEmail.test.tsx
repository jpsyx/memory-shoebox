import { describe, expect, it } from "vitest";
import * as templates from "../src/index.ts";
import type { InvitationEmailPayload } from "@memory-shoebox/shared";
const PAYLOAD: InvitationEmailPayload = {
  shoeboxName: "Family",
  baseUrl: "https://shoebox.example",
  timezone: "UTC",
  toDisplayName: "Ana",
  preferencesUrl: null,
  inviterDisplayName: "Rosa",
  inviterEmail: "rosa@example.com",
  invitedAddress: "ana+family@example.com",
  joinUrl: "https://shoebox.example/join?address=ana%2Bfamily%40example.com",
  expiresAt: "2026-10-11T12:00:00.000Z",
  visibleItemCount: 1,
  memberCount: 2,
};
describe("invitation email", () => {
  it.each([
    [0, "There are no photos or videos yet"],
    [1, "It holds 1 photo or video"],
    [2147, "It holds 2,147 photos and videos"],
  ])("renders count %s in HTML and text", async (count, copy) => {
    expect(templates).toHaveProperty("invitationEmail");
    const rendered = await templates.invitationEmail.render({
      ...PAYLOAD,
      visibleItemCount: count as number,
    });
    expect(rendered.html).toContain(copy);
    expect(rendered.text).toContain(copy);
  });
  it("renders address-prefilled entry, code reassurance, expiry and frozen attribution", async () => {
    expect(templates).toHaveProperty("invitationEmail");
    expect(templates.invitationEmail.subject(PAYLOAD)).toBe(
      "Rosa has added you to Family",
    );
    const { html, text } = await templates.invitationEmail.render(PAYLOAD);
    [html, text.replace(/\s+/g, " ")].forEach((copy) => {
      expect(copy).toContain(PAYLOAD.joinUrl);
      expect(copy).toContain(PAYLOAD.invitedAddress);
      expect(copy).toContain("nothing to install");
      expect(copy).toContain("no password");
      expect(copy).toContain("six-digit code");
      expect(copy).toContain("seven days");
      expect(copy).toContain("11 October 2026");
      expect(copy).toContain("rosa@example.com");
      expect(copy).toContain("Only the 2 people");
    });
    expect(await templates.invitationEmail.render(PAYLOAD)).toEqual({
      html,
      text,
    });
  });
  it("omits preferences even when common payload supplies an account link", async () => {
    const { html, text } = await templates.invitationEmail.render({
      ...PAYLOAD,
      preferencesUrl: "https://shoebox.example/account",
    });
    expect(html).not.toContain("Turn these emails off");
    expect(text).not.toContain("Turn these emails off");
    expect(html).not.toContain("https://shoebox.example/account");
    expect(text).not.toContain("https://shoebox.example/account");
  });
  it("escapes names in HTML while preserving their literal text", async () => {
    expect(templates).toHaveProperty("invitationEmail");
    const { html, text } = await templates.invitationEmail.render({
      ...PAYLOAD,
      inviterDisplayName: '<script>alert("x")</script>',
      shoeboxName: "A & B",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
    expect(text).toContain('<script>alert("x")</script>');
  });
});
