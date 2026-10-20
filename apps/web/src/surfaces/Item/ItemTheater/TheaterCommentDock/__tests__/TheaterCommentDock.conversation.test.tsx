import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderDock,
  getCommentBubble,
  advanceDockTimers,
  hoverDock,
  leaveDock,
} from "./TheaterCommentDockTestHelpers";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TheaterCommentDock shared conversation", () => {
  it("owns the real reaction picker portal and lets its Escape close only the picker", async () => {
    vi.useFakeTimers();
    const { panel, container } = renderDock();
    hoverDock(getCommentBubble());
    fireEvent.click(screen.getByRole("button", { name: "Choose a reaction" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    const picker = screen.getByRole("dialog", { name: "Choose a reaction" });
    expect(
      container.querySelector("[data-theater-comment-portals]"),
    ).toContainElement(picker);
    expect(panel).not.toContainElement(picker);
    leaveDock(panel);
    advanceDockTimers(1000);
    expect(panel).not.toHaveAttribute("inert");
    fireEvent.keyDown(within(picker).getAllByRole("button")[0]!, {
      key: "Escape",
    });
    expect(panel).not.toHaveAttribute("inert");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => {
      screen.getByRole("button", { name: "Outside" }).focus();
    });
    advanceDockTimers(450);
    expect(panel).toHaveAttribute("inert");
  });

  it("holds the real delete dialog outside the scrolling panel until it closes", async () => {
    vi.useFakeTimers();
    const { panel, container } = renderDock();
    hoverDock(getCommentBubble());
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    const dialog = screen.getByRole("dialog", {
      name: "Delete what you wrote?",
    });
    expect(
      container.querySelector("[data-theater-comment-portals]"),
    ).toContainElement(dialog);
    expect(panel).not.toContainElement(dialog);
    leaveDock(panel);
    advanceDockTimers(1000);
    expect(panel).not.toHaveAttribute("inert");
    fireEvent.keyDown(within(dialog).getByRole("button", { name: "Keep it" }), {
      key: "Escape",
    });
    expect(panel).not.toHaveAttribute("inert");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => {
      screen.getByRole("button", { name: "Outside" }).focus();
    });
    advanceDockTimers(450);
    expect(panel).toHaveAttribute("inert");
  });

  it("preserves reply and edit instances and the scoped portal target across presentations", () => {
    const view = renderDock("page");
    fireEvent.click(screen.getByRole("button", { name: /Reply to/ }));
    const reply = screen.getByRole("textbox", { name: /Reply to/ });
    fireEvent.change(reply, { target: { value: "My unfinished reply" } });
    const portal = view.container.querySelector(
      "[data-theater-comment-portals]",
    );
    view.show("theater");
    fireEvent.click(getCommentBubble());
    expect(screen.getByRole("textbox", { name: /Reply to/ })).toBe(reply);
    expect(reply).toHaveValue("My unfinished reply");
    expect(view.container.querySelector("[data-theater-comment-portals]")).toBe(
      portal,
    );
    view.show("page");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("textbox", { name: "What you wrote" });
    fireEvent.change(editor, { target: { value: "Edited but unsent" } });
    view.show("theater");
    fireEvent.click(getCommentBubble());
    expect(screen.getByRole("textbox", { name: "What you wrote" })).toBe(
      editor,
    );
    expect(editor).toHaveValue("Edited but unsent");
  });
});
