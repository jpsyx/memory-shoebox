import { describe, expect, it } from "vitest";
import { invitationEmail } from "../src/index.ts";

/**
 * Rendered output catches react-email's default blue link and 14px paragraph
 * overrides.
 */
describe("email reading and action styles", () => {
  it("renders legible body copy, a contrasting action and underlined footer links", async () => {
    const { html } = await invitationEmail.render({
      shoeboxName: "Family",
      baseUrl: "https://shoebox.example",
      timezone: "UTC",
      toDisplayName: "Ana",
      preferencesUrl: null,
      inviterDisplayName: "Rosa",
      inviterEmail: "rosa@example.com",
      invitedAddress: "ana@example.com",
      joinUrl: "https://shoebox.example/join",
      expiresAt: "2026-10-11T12:00:00.000Z",
      visibleItemCount: 1,
      memberCount: 2,
    });
    const action = html.match(
      /<a[^>]+href="https:\/\/shoebox.example\/join"[^>]*>/,
    )?.[0];
    expect(action).toContain("background-color:#1b1f22");
    expect(action).toContain("color:#ffffff");
    expect(action).toContain("padding:12px 20px");
    const paragraph = html.match(/<p[^>]*>It holds 1 photo or video/)?.[0];
    expect(paragraph).toContain("font-size:16px");
    const source = html.match(
      /<a[^>]+href="https:\/\/github.com\/jpsyx\/memory-shoebox"[^>]*>/,
    )?.[0];
    expect(source).toContain("text-decoration:underline");
  });
});
