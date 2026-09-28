import { Text } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { signInCodeEmail } from "../src/templates/SignInCodeEmail.tsx";
import { renderEmail } from "../src/lib/renderEmail.ts";

const LONG_SENTENCE =
  "This sentence runs well past any sensible column so that a renderer which has stopped wrapping has nowhere left to hide from this assertion.";

describe("renderEmail", () => {
  it("wraps the plain-text form", async () => {
    const rendered = await renderEmail(<Text>{LONG_SENTENCE}</Text>);
    const longest = Math.max(
      ...rendered.text.split("\n").map((line) => {
        return line.length;
      }),
    );

    expect(longest).toBeLessThanOrEqual(58);
  });

  it("leaves the html unwrapped, where the client does its own line breaking", async () => {
    const rendered = await renderEmail(<Text>{LONG_SENTENCE}</Text>);

    expect(rendered.html).toContain(LONG_SENTENCE);
  });
});

/**
 * The wrapping guarantee, asserted on a real message rather than a fixture.
 *
 * Every other test in this package checks that words are present, and a
 * message whose plain-text form arrived as four unbroken paragraphs would
 * satisfy all of them. This is the one that would notice.
 */
describe("the sign-in code message, as plain text", () => {
  it("has no line past the column the mockups were drawn at", async () => {
    const rendered = await signInCodeEmail.render({
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      preferencesUrl: null,
      code: "410233",
      expiresInMinutes: 10,
    });

    const overlong = rendered.text.split("\n").filter((line) => {
      return line.length > 58;
    });

    expect(overlong).toEqual([]);
  });
});
