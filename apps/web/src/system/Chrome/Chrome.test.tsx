import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Banner } from "@/system/Chrome/Banner";
import { Card } from "@/system/Chrome/Card";
import { Centred } from "@/system/Chrome/Centred";
import { Page } from "@/system/Chrome/Page";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

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
