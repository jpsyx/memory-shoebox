import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";
import { Headline } from "@/system/typography/Headline";
import { LabelText } from "@/system/typography/LabelText";
import { Lede } from "@/system/typography/Lede";
import { Prose } from "@/system/typography/Prose";
import { Stat } from "@/system/typography/Stat";

function _inTheme(node: ReactNode): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>
  );
}

describe("the typography", () => {
  it("renders every block", () => {
    render(
      _inTheme(
        <>
          <Lede>A lede</Lede>
          <Headline>A headline</Headline>
          <LabelText>A label</LabelText>
          <Prose>Some prose</Prose>
          <Stat figure="212" label="photos" />
        </>,
      ),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "A lede",
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "A headline",
    );
    expect(screen.getByText("A label")).toBeVisible();
    expect(screen.getByText("Some prose")).toBeVisible();
    expect(screen.getByText("212")).toBeVisible();
  });
});
