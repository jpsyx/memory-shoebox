import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Chip } from "@/system/Chip/Chip";
import { ChipRow } from "@/system/Chip/ChipRow";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function _inTheme(node: ReactNode): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>
  );
}

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

  it("says a filter that is off is off", () => {
    render(
      _inTheme(
        <ChipRow>
          <Chip active={false} onClick={() => {}}>
            beach
          </Chip>
        </ChipRow>,
      ),
    );

    expect(screen.getByRole("button", { name: "beach" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("announces an action as a plain button rather than a toggle", () => {
    render(
      _inTheme(
        <ChipRow>
          <Chip onClick={() => {}}>+ Add a tag</Chip>
        </ChipRow>,
      ),
    );

    expect(
      screen.getByRole("button", { name: "+ Add a tag" }),
    ).not.toHaveAttribute("aria-pressed");
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
