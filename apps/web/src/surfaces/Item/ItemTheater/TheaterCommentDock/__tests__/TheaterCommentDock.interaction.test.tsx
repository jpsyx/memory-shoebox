import { act, fireEvent, screen } from "@testing-library/react";
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

describe("TheaterCommentDock", () => {
  it("preserves the actual composer node, full words and captured anchor through collapse and presentations", () => {
    vi.useFakeTimers();
    const view = renderDock("page");
    fireEvent.click(screen.getByRole("button", { name: "Seek 6.25" }));
    act(() => {
      view.field.focus();
    });
    fireEvent.change(view.field, {
      target: {
        value: "All of these words stay exactly here.\nAnd this second line.",
      },
    });
    view.show("theater");
    expect(view.panel).toHaveAttribute("inert");
    hoverDock(getCommentBubble());
    expect(screen.getAllByRole("textbox")).toEqual([view.field]);
    expect(view.field).toHaveFocus();
    expect(view.field).toHaveValue(
      "All of these words stay exactly here.\nAnd this second line.",
    );
    expect(
      screen.getByRole("button", {
        name: "Comment at 0:06; switch to whole video",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Seek 12.5" }));
    leaveDock(getCommentBubble());
    advanceDockTimers(450);
    hoverDock(getCommentBubble());
    expect(screen.getByRole("textbox")).toBe(view.field);
    expect(
      screen.getByRole("button", {
        name: "Comment at 0:06; switch to whole video",
      }),
    ).toBeVisible();
    view.show("page");
    expect(screen.getByRole("textbox")).toBe(view.field);
    expect(view.panel).not.toHaveAttribute("inert");
    expect(
      screen.queryByRole("button", { name: /Open comments/ }),
    ).not.toBeInTheDocument();
  });

  it("makes collapsed content inaccessible and closes at 450ms despite hover autofocus", () => {
    vi.useFakeTimers();
    const { field, panel } = renderDock();
    expect(panel).toHaveAttribute("inert");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    hoverDock(getCommentBubble());
    expect(field).toHaveFocus();
    expect(panel).not.toHaveAttribute("inert");
    leaveDock(getCommentBubble());
    advanceDockTimers(449);
    expect(panel).not.toHaveAttribute("inert");
    const bubble = getCommentBubble();
    let wasPanelInertAtFocus = false;
    bubble.addEventListener("focus", () => {
      wasPanelInertAtFocus = panel.hasAttribute("inert");
    });
    advanceDockTimers(1);
    expect(panel).toHaveAttribute("inert");
    expect(bubble).toHaveFocus();
    expect(wasPanelInertAtFocus).toBe(true);
  });

  it("cancels departure on re-entry and crosses from bubble to panel without closing", () => {
    vi.useFakeTimers();
    const { panel } = renderDock();
    hoverDock(getCommentBubble());
    leaveDock(getCommentBubble(), panel);
    advanceDockTimers(500);
    expect(panel).not.toHaveAttribute("inert");
    leaveDock(panel);
    advanceDockTimers(449);
    hoverDock(panel);
    advanceDockTimers(1);
    expect(panel).not.toHaveAttribute("inert");
    leaveDock(panel);
    advanceDockTimers(450);
    expect(panel).toHaveAttribute("inert");
  });

  it("pins explicit keyboard opening until focus departs and restores bubble focus on Escape", () => {
    vi.useFakeTimers();
    const { field, panel } = renderDock();
    act(() => {
      getCommentBubble().focus();
    });
    expect(panel).toHaveAttribute("inert");
    fireEvent.keyDown(getCommentBubble(), { key: "ArrowUp" });
    expect(field).toHaveFocus();
    leaveDock(panel);
    advanceDockTimers(1000);
    expect(panel).not.toHaveAttribute("inert");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(panel).toHaveAttribute("inert");
    expect(getCommentBubble()).toHaveFocus();
    fireEvent.click(getCommentBubble());
    act(() => {
      screen.getByRole("button", { name: "Outside" }).focus();
    });
    advanceDockTimers(450);
    expect(panel).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });

  it("uses focus departure for explicit keyboard activation even with a pointer remaining inside", () => {
    vi.useFakeTimers();
    const { panel } = renderDock();
    const bubble = getCommentBubble();
    hoverDock(bubble);
    fireEvent.keyDown(bubble, { key: "ArrowUp" });
    act(() => {
      screen.getByRole("button", { name: "Outside" }).focus();
    });
    advanceDockTimers(450);
    expect(panel).toHaveAttribute("inert");
  });

  it("restores focus to the bubble when item navigation collapses an open panel", () => {
    const view = renderDock();
    fireEvent.click(getCommentBubble());
    expect(view.field).toHaveFocus();
    view.show("theater", "other-item");
    expect(view.panel).toHaveAttribute("inert");
    expect(getCommentBubble()).toHaveFocus();
  });

  it("opens explicitly from the existing Comment action and focuses the reused field", () => {
    const { field } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Comment action" }));
    expect(field).toHaveFocus();
    expect(screen.getAllByRole("textbox")).toEqual([field]);
    act(() => {
      screen.getByRole("button", { name: "Outside" }).focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment action" }));
    expect(field).toHaveFocus();
  });

  it("ignores touch hover and opens on touch activation", () => {
    const { panel, field } = renderDock();
    fireEvent.pointerEnter(getCommentBubble(), { pointerType: "touch" });
    expect(panel).toHaveAttribute("inert");
    fireEvent.click(getCommentBubble());
    expect(field).toHaveFocus();
  });

  it("resets openness on navigation, unavailability and leaving theater without stale timers", () => {
    vi.useFakeTimers();
    const view = renderDock();
    hoverDock(getCommentBubble());
    leaveDock(view.panel);
    view.show("theater", "other-item");
    expect(view.panel).toHaveAttribute("inert");
    fireEvent.click(getCommentBubble());
    advanceDockTimers(450);
    expect(view.panel).not.toHaveAttribute("inert");
    view.show("theater", "other-item", true);
    expect(view.panel).toHaveAttribute("inert");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    view.show("page");
    expect(view.panel).not.toHaveAttribute("inert");
    view.show("theater");
    expect(view.panel).toHaveAttribute("inert");
  });
});
