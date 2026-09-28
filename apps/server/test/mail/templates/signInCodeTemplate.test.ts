import { describe, expect, it } from "vitest";
import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";
import { signInCodeTemplate } from "../../../src/mail/templates/signInCodeTemplate.ts";

const PAYLOAD: SignInCodeEmailPayload = {
  shoeboxName: "My Shoebox",
  baseUrl: "https://shoebox.example",
  timezone: "Europe/Madrid",
  toDisplayName: "Abuela Rosa",
  preferencesUrl: null,
  code: "410233",
  expiresAt: "2026-09-27T10:10:00.000Z",
  expiresInMinutes: 10,
};

describe("the sign-in code message", () => {
  it("puts the digits in the subject, so the code reads off a lock screen", () => {
    expect(signInCodeTemplate.subject(PAYLOAD)).toBe("Your code is 410233");
  });

  it("renders the digits, the ten minutes, and the reassurance", () => {
    const html = signInCodeTemplate.html(PAYLOAD);

    expect(html).toContain("410233");
    expect(html).toContain("It works for ten minutes and then it stops.");
    expect(html).toContain("somebody typed your address by mistake");
    expect(html).toContain("My Shoebox");
  });

  it("renders a plain-text alternative that stands on its own", () => {
    const text = signInCodeTemplate.text(PAYLOAD);

    expect(text).toContain("MY SHOEBOX");
    expect(text).toContain("410233");
    expect(text).toContain("This went to you because you are in My Shoebox.");
  });

  it("omits the preferences link in both forms, because there is no switch to offer", () => {
    expect(signInCodeTemplate.html(PAYLOAD)).not.toContain(
      "Turn these emails off",
    );
    expect(signInCodeTemplate.text(PAYLOAD)).not.toContain(
      "Turn these emails off",
    );
  });

  it("references no design token, because a mail client resolves none", () => {
    const html = signInCodeTemplate.html(PAYLOAD);

    expect(html).not.toContain("var(--");
    expect(html).not.toContain("color-mix");
    expect(html).toContain("Arial");
  });

  it("takes the minutes from the payload rather than hard-coding the word", () => {
    const html = signInCodeTemplate.html({ ...PAYLOAD, expiresInMinutes: 5 });

    expect(html).toContain("It works for five minutes and then it stops.");
  });

  it("escapes a Shoebox name that contains markup", () => {
    const html = signInCodeTemplate.html({
      ...PAYLOAD,
      shoeboxName: "<script>alert(1)</script>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
