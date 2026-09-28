import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Banner, Card, Centred, Page, Sheet, SheetHead } from "@/system/Chrome";
import { Chip, ChipRow } from "@/system/Chip";
import { FilterStrip } from "@/system/FilterStrip";
import { cssVariablesResolver, theme } from "@/theme/theme";
import { Headline, LabelText, Lede, Prose, Stat } from "@/system/typography";

function _inTheme(node: ReactNode): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>
  );
}

describe("the chrome", () => {
  it("renders a page, a sheet and a banner", () => {
    render(
      _inTheme(
        <Page>
          <Sheet label="A sheet">
            <SheetHead title="A heading" />
            <Banner>Something plain.</Banner>
          </Sheet>
        </Page>,
      ),
    );

    expect(screen.getByRole("heading", { name: "A heading" })).toBeVisible();
    expect(screen.getByLabelText("A sheet")).toBeVisible();
    expect(screen.getByText("Something plain.")).toBeVisible();
  });

  it("renders the card on its own centred panel", () => {
    render(
      _inTheme(
        <Centred>
          <Card>Sign in</Card>
        </Centred>,
      ),
    );
    expect(screen.getByText("Sign in")).toBeVisible();
  });
});

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
    expect(screen.getByText("212")).toBeVisible();
  });
});

describe("Chip", () => {
  it("carries its pressed state rather than only its colour", () => {
    render(
      _inTheme(
        <ChipRow>
          <Chip active onClick={() => {}}>
            hospital
          </Chip>
        </ChipRow>,
      ),
    );

    expect(screen.getByRole("button", { name: "hospital" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps a filter that would return nothing focusable and announced", () => {
    render(
      _inTheme(
        <ChipRow>
          <Chip quiet onClick={() => {}}>
            beach
          </Chip>
        </ChipRow>,
      ),
    );

    expect(screen.getByRole("button", { name: "beach" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("FilterStrip", () => {
  it("shows what is on and the way out of it", () => {
    render(
      _inTheme(
        <FilterStrip count={318} onClear={() => {}}>
          <Chip onPanel>Mateo</Chip>
        </FilterStrip>,
      ),
    );

    expect(screen.getByText("318")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Clear, show everything" }),
    ).toBeVisible();
  });
});
