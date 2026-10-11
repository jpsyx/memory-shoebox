import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JumpRail } from "@/surfaces/Timeline/JumpRail/JumpRail";
import { theme } from "@/theme/theme";

const DAYS = [
  { capturedOn: "2026-09-15", itemCount: 8, photoCount: 4, videoCount: 4 },
  { capturedOn: "2026-09-14", itemCount: 2, photoCount: 1, videoCount: 1 },
  { capturedOn: "2026-09-13", itemCount: 0, photoCount: 0, videoCount: 0 },
];

function _render(loadedDays: string[] = []) {
  const onRestart = vi.fn();
  render(
    <MantineProvider theme={theme}>
      <JumpRail
        days={DAYS}
        standingOn="2026-09-15"
        loadedDays={loadedDays}
        onRestart={onRestart}
      />
      <div id="day-2026-09-14">Loaded day</div>
    </MantineProvider>,
  );
  return { onRestart };
}

describe("JumpRail", () => {
  it("shows each day's photo and video counts, including singular and empty days", async () => {
    _render();
    expect(screen.getByRole("combobox", { name: "Jump to" })).toHaveValue(
      "15 sep · 4 photos · 4 videos",
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Jump to" }));
    expect(
      screen.getByRole("option", { name: "14 sep · 1 photo · 1 video" }),
    ).toBeVisible();
    expect(
      screen.getByRole("option", { name: "13 sep · 0 photos · 0 videos" }),
    ).toBeVisible();
  });

  it("restarts at an unloaded day chosen from the dropdown", async () => {
    const { onRestart } = _render();
    await userEvent.click(screen.getByRole("combobox", { name: "Jump to" }));
    await userEvent.click(
      screen.getByRole("option", { name: "14 sep · 1 photo · 1 video" }),
    );
    expect(onRestart).toHaveBeenCalledWith("2026-09-14");
  });

  it("scrolls to a loaded day selected with the keyboard", async () => {
    const { onRestart } = _render(["2026-09-14"]);
    const onScroll = vi.fn();
    screen.getByText("Loaded day").scrollIntoView = onScroll;
    screen.getByRole("combobox", { name: "Jump to" }).focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onScroll).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
    expect(onRestart).not.toHaveBeenCalled();
  });

  it("keeps the current date when its option is chosen again", async () => {
    const { onRestart } = _render();
    await userEvent.click(screen.getByRole("combobox", { name: "Jump to" }));
    await userEvent.click(
      screen.getByRole("option", { name: "15 sep · 4 photos · 4 videos" }),
    );
    expect(screen.getByRole("combobox", { name: "Jump to" })).toHaveValue(
      "15 sep · 4 photos · 4 videos",
    );
    expect(onRestart).not.toHaveBeenCalledWith("");
  });
});
