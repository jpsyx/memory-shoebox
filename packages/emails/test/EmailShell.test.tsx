import { Text } from "@react-email/components";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { EmailShell } from "../src/lib/EmailShell";

/** The shell with a one-line body, which is all these cases need. */
function shellWith(preferencesUrl: string | null): React.JSX.Element {
  return (
    <EmailShell shoeboxName="My Shoebox" preferencesUrl={preferencesUrl}>
      <Text>the body</Text>
    </EmailShell>
  );
}

describe("the shell every message sits in", () => {
  it("names the Shoebox in the masthead and in the footer", async () => {
    const html = await render(shellWith(null));

    expect(html).toContain("My Shoebox");
    expect(html).toContain("This went to you because you are in My Shoebox.");
  });

  it("offers the source, which the licence obliges", async () => {
    const html = await render(shellWith(null));

    expect(html).toContain("https://github.com/jpsyx/memory-shoebox");
    expect(html).toContain("get the source of");
  });

  it("omits the preferences link when there is no switch to offer", async () => {
    const html = await render(shellWith(null));

    expect(html).not.toContain("Turn these emails off");
  });

  it("offers the preferences link when there is one", async () => {
    const html = await render(shellWith("https://shoebox.example/account"));

    expect(html).toContain("Turn these emails off");
    expect(html).toContain("https://shoebox.example/account");
  });

  it("references no design token, because a mail client resolves none", async () => {
    const html = await render(shellWith(null));

    expect(html).not.toContain("var(--");
    expect(html).not.toContain("color-mix");
    expect(html).toContain("Arial");
  });

  it("carries the body through to the plain-text form", async () => {
    const text = await render(shellWith(null), { plainText: true });

    expect(text).toContain("the body");
    expect(text).toContain("My Shoebox");
    expect(text).not.toContain("<");
  });
});
