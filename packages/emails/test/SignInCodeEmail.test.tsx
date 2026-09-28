import { describe, expect, it } from "vitest";
import type { SignInCodeEmailPayload } from "@memory-shoebox/shared";
import { signInCodeEmail } from "../src/templates/SignInCodeEmail";

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
    expect(signInCodeEmail.subject(PAYLOAD)).toBe("Your code is 410233");
  });

  it("renders the digits, the ten minutes, and the reassurance", async () => {
    const { html } = await signInCodeEmail.render(PAYLOAD);

    expect(html).toContain("410233");
    expect(html).toContain("It works for ten minutes and then it stops.");
    expect(html).toContain("somebody typed your address by mistake");
    expect(html).toContain("My Shoebox");
  });

  it("renders a plain-text alternative that stands on its own", async () => {
    const { text } = await signInCodeEmail.render(PAYLOAD);

    expect(text).toContain("My Shoebox");
    expect(text).toContain("410233");
    expect(text).toContain("This went to you because you are in My Shoebox.");
  });

  it("omits the preferences link in both forms, because there is no switch to offer", async () => {
    const { html, text } = await signInCodeEmail.render(PAYLOAD);

    expect(html).not.toContain("Turn these emails off");
    expect(text).not.toContain("Turn these emails off");
  });

  it("references no design token, because a mail client resolves none", async () => {
    const { html } = await signInCodeEmail.render(PAYLOAD);

    expect(html).not.toContain("var(--");
    expect(html).not.toContain("color-mix");
    expect(html).toContain("Arial");
  });

  it("takes the minutes from the payload rather than hard-coding the word", async () => {
    const { html } = await signInCodeEmail.render({
      ...PAYLOAD,
      expiresInMinutes: 5,
    });

    expect(html).toContain("It works for five minutes and then it stops.");
  });

  it("renders the same message twice, so a retry cannot differ", async () => {
    const first = await signInCodeEmail.render(PAYLOAD);
    const second = await signInCodeEmail.render(PAYLOAD);

    expect(second).toEqual(first);
  });
});
