import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArchiveEnd } from "@/surfaces/Timeline/ArchiveEnd/ArchiveEnd";
import { theme } from "@/theme/theme";

function _render(totals: {
  itemTotal: number;
  dayCount: number;
  firstCapturedOn: string | undefined;
}) {
  render(
    <MantineProvider theme={theme}>
      <ArchiveEnd totals={totals} />
    </MantineProvider>,
  );
}

describe("ArchiveEnd", () => {
  it("marks the end rather than just stopping", () => {
    _render({ itemTotal: 2147, dayCount: 948, firstCapturedOn: "2024-02-11" });
    expect(screen.getByText("The beginning")).toBeTruthy();
    expect(screen.getByText("That is all of it.")).toBeTruthy();
  });

  it("prints the three figures the rail already scanned", () => {
    _render({ itemTotal: 2147, dayCount: 948, firstCapturedOn: "2024-02-11" });
    expect(screen.getByText(/2,147 photos and videos/)).toBeTruthy();
    expect(screen.getByText(/948 days/)).toBeTruthy();
    expect(screen.getByText(/11 February 2024/)).toBeTruthy();
  });

  it("says one day and one photo in the singular", () => {
    _render({ itemTotal: 1, dayCount: 1, firstCapturedOn: "2024-02-11" });
    expect(screen.getByText(/1 photo or video/)).toBeTruthy();
    expect(screen.getByText(/1 day/)).toBeTruthy();
  });

  it("leaves the first day out when the rail knows of none", () => {
    _render({ itemTotal: 0, dayCount: 0, firstCapturedOn: undefined });
    expect(screen.queryByText(/the first day anything went up/)).toBeNull();
  });
});
