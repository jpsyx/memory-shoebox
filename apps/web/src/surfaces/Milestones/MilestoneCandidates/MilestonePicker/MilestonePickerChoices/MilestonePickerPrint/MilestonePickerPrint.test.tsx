import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeItemSummaryFromOverrides } from "@/testing/askingAndOccasionsFixtures";
import { MilestonePickerPrint } from "./MilestonePickerPrint";

describe("unavailable print keyboard ownership", () => {
  it("keeps focus and the chosen intent when the focused print loses its thumbnail", async () => {
    render(
      <MilestonePickerPrint
        entry={{ item: makeItemSummaryFromOverrides(), isAttached: true }}
        seed={0}
        onToggle={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Family at home" }),
    ).toHaveFocus();
    fireEvent.error(screen.getByRole("img", { name: "Family at home" }));
    const unavailable = screen.getByRole("button", {
      name: "Unavailable photograph: Family at home",
    });
    expect(unavailable).toHaveFocus();
    expect(unavailable).toHaveAttribute("aria-pressed", "true");
  });
  it("does not steal focus from a surviving control when another print fails", async () => {
    render(
      <>
        <button type="button">Continue</button>
        <MilestonePickerPrint
          entry={{ item: makeItemSummaryFromOverrides(), isAttached: false }}
          seed={0}
          onToggle={() => {}}
        />
      </>,
    );
    await userEvent.tab();
    fireEvent.error(screen.getByRole("img", { name: "Family at home" }));
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
  });
});
