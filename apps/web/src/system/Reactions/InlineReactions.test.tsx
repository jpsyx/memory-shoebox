import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactionKind, ReactionSummary } from "@memory-shoebox/shared";
import { Reactions } from "./Reactions";
import { theme } from "@/theme/theme";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";

const VIEWER = { memberId: "me", displayName: "Pablo" };
const EMPTY: ReactionSummary = { kinds: [], myKind: null };
function _render(onReact = vi.fn<(kind: ReactionKind | null) => void>()) {
  const result = render(
    <MantineProvider
      env="test"
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
    >
      <Reactions
        reactions={EMPTY}
        viewer={VIEWER}
        onReact={onReact}
        variant="inline"
      />
    </MantineProvider>,
  );
  return { ...result, onReact };
}
afterEach(() => {
  vi.useRealTimers();
});

describe("inline comment reactions", () => {
  it("quickly adds Love and lets the same action remove it", async () => {
    const { onReact } = _render();
    await userEvent.click(
      screen.getByRole("button", { name: "React with Love" }),
    );
    expect(onReact).toHaveBeenLastCalledWith("love");
    expect(
      screen.getByRole("button", { name: "1 reaction. See who left it" }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Love reaction" }),
    );
    expect(onReact).toHaveBeenLastCalledWith(null);
    expect(
      screen.queryByRole("button", { name: /See who left/ }),
    ).not.toBeInTheDocument();
  });

  it("waits on hover and keeps choices open while the pointer crosses into the bar", async () => {
    vi.useFakeTimers();
    const { onReact } = _render();
    const action = screen.getByRole("button", { name: "React with Love" });
    fireEvent.pointerEnter(action, { pointerType: "mouse" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    const bar = screen.getByRole("dialog", { name: "Choose a reaction" });
    fireEvent.pointerLeave(action, { pointerType: "mouse" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.pointerEnter(bar, { pointerType: "mouse" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    fireEvent.click(within(bar).getByRole("button", { name: "Wow" }));
    expect(onReact).toHaveBeenCalledWith("wow");
  });

  it("offers a keyboard and touch route to every reaction without hover", async () => {
    const { onReact } = _render();
    await userEvent.click(
      screen.getByRole("button", { name: "Choose a reaction" }),
    );
    const bar = await screen.findByRole("dialog", {
      name: "Choose a reaction",
    });
    ["Love", "Like", "Care", "Haha", "Wow", "Sad"].forEach((name) => {
      expect(within(bar).getByRole("button", { name })).toBeVisible();
    });
    await userEvent.click(within(bar).getByRole("button", { name: "Care" }));
    expect(onReact).toHaveBeenCalledWith("care");
  });

  it("lets Escape dismiss hover choices without moving focus into them", async () => {
    _render();
    const action = screen.getByRole("button", { name: "React with Love" });
    action.focus();
    await userEvent.hover(action);
    await screen.findByRole("dialog", { name: "Choose a reaction" });
    expect(action).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(action).toHaveFocus();
  });

  it("returns keyboard focus to the chooser when its bar closes", async () => {
    _render();
    const chooser = screen.getByRole("button", { name: "Choose a reaction" });
    await userEvent.click(chooser);
    const bar = await screen.findByRole("dialog", {
      name: "Choose a reaction",
    });
    await waitFor(() => {
      expect(within(bar).getByRole("button", { name: "Love" })).toHaveFocus();
    });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(chooser).toHaveFocus();
    });
  });
});
