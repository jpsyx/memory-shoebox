import { Body, Html, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

/** The smallest thing that exercises the toolchain end to end. */
function Probe(): React.JSX.Element {
  return (
    <Html>
      <Body>
        <Text>hello from a component</Text>
      </Body>
    </Html>
  );
}

describe("the react-email toolchain", () => {
  it("renders a component to html", async () => {
    const html = await render(<Probe />);

    expect(html).toContain("hello from a component");
    expect(html).toContain("<html");
  });

  it("renders the same component to plain text, with no markup left", async () => {
    const text = await render(<Probe />, { plainText: true });

    expect(text).toContain("hello from a component");
    expect(text).not.toContain("<html");
    expect(text).not.toContain("<p");
  });
});
