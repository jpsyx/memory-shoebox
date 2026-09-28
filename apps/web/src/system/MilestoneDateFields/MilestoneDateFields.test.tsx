import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  MilestoneDateFields,
  type MilestoneSpan,
} from "@/system/MilestoneDateFields/MilestoneDateFields";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function _render(node: ReactNode) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

/** A controlled wrapper, since the switch's effect is in the caller's state. */
function StatefulFields() {
  const [span, setSpan] = useState<MilestoneSpan>({
    startsOn: "2026-09-14",
    endsOn: null,
    isMultiDay: false,
  });
  return <MilestoneDateFields span={span} onChange={setSpan} />;
}

describe("the milestone span fields", () => {
  it("offers one date by default, and a switch into a span", async () => {
    _render(<StatefulFields />);

    expect(screen.getByText("It ran over more than one day")).toBeVisible();
    expect(screen.getByText("When it happened")).toBeVisible();

    // `getByRole` with a `name` cannot resolve Mantine's Switch: its
    // accessible name comes from a wrapping `<label>` that also contains the
    // track and thumb, which the accessible-name computation does not
    // collapse to the label text alone. There is only the one switch on this
    // form, so selecting it directly is unambiguous.
    await userEvent.click(screen.getByRole("switch"));

    expect(screen.getByText("When it ran")).toBeVisible();
    expect(screen.queryByText("When it happened")).toBeNull();
  });
});
