import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import { MilestoneFix } from "./MilestoneFix";
const milestone = {
  ...makeMilestoneDetailFromOverrides().milestone,
  startsOn: "2026-09-18",
  endsOn: "2026-09-20",
};
const strays = ["first", "second", "third", "fourth"].map((itemId) => {
  return {
    itemId,
    media: makeItemSummaryFromOverrides().media,
    capturedOn: "2026-08-31",
  };
});
function _props() {
  return {
    milestone,
    strays,
    totalMismatchCount: 650,
    wideningSpan: { startsOn: "2026-08-31", endsOn: "2026-10-02" },
    targets: {},
    onTargetChange: vi.fn(),
    onMove: vi.fn(),
    onWiden: vi.fn(),
    onAcknowledge: vi.fn(),
    isPending: false,
  };
}
describe("controlled reconciliation sheet", () => {
  it("distinguishes the visible batch from the full set and requires explicit dates", async () => {
    const props = _props();
    render(
      <MantineProvider>
        <MilestoneFix {...props} />
      </MantineProvider>,
    );
    expect(screen.getByText(/650.*outside Home/)).toBeVisible();
    expect(screen.getByText(/Showing 4/)).toBeVisible();
    expect(screen.getAllByRole("combobox")[0]).toHaveValue("");
    expect(screen.getByRole("button", { name: "Move the 4" })).toBeDisabled();
    await userEvent.selectOptions(
      screen.getAllByRole("combobox")[0]!,
      "2026-09-18",
    );
    expect(props.onTargetChange).toHaveBeenCalledWith({
      itemId: "first",
      targetOn: "2026-09-18",
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Leave these 4 as they are" }),
    );
    expect(props.onAcknowledge).toHaveBeenCalledOnce();
  });
  it("shows server full-set extrema and uses a distinct widen action", async () => {
    const props = _props();
    render(
      <MantineProvider>
        <MilestoneFix {...props} />
      </MantineProvider>,
    );
    await userEvent.click(
      screen.getByRole("radio", { name: /Widen the occasion/ }),
    );
    expect(screen.getByText(/2 Oct/)).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Widen the occasion" }),
    );
    expect(props.onWiden).toHaveBeenCalledOnce();
    expect(props.onMove).not.toHaveBeenCalled();
  });
  it("retains values and associates per-item errors, replacing failed media", () => {
    render(
      <MantineProvider>
        <MilestoneFix
          {..._props()}
          targets={{ first: "2026-09-18" }}
          fieldErrors={{ first: "Choose again" }}
        />
      </MantineProvider>,
    );
    expect(screen.getAllByRole("combobox")[0]).toHaveValue("2026-09-18");
    expect(screen.getAllByRole("combobox")[0]).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "Move the 4" })).toBeDisabled();
    fireEvent.error(screen.getAllByRole("img")[0]!);
    expect(screen.getByText("Photograph unavailable.")).toBeVisible();
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });
});
