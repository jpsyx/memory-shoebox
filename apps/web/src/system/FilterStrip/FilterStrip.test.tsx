import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Chip } from "@/system/Chip/Chip";
import { FilterStrip } from "@/system/FilterStrip/FilterStrip";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function _inTheme(node: ReactNode): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>
  );
}

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
