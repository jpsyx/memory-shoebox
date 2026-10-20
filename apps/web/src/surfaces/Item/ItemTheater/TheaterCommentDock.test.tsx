import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemPresentation } from "../ItemViewer/ItemViewer.types";
import { useVideoTransport } from "../ItemViewer/useVideoTransport";
import { ItemCommentDraftProvider } from "../ItemConversation/ItemCommentDraftProvider";
import { ItemComments } from "../ItemConversation/ItemComments/ItemComments";
import { TheaterCommentDock } from "./TheaterCommentDock";
import { useTheaterCommentDock } from "./useTheaterCommentDock";
import { makeQueryClientFromItemDetail } from "@/testing/itemWriteTestHelpers";
import {
  ITEM_ID,
  makeComment,
  makeVideoDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import { theme } from "@/theme/theme";

const DETAIL = makeVideoDetail({
  comments: [
    makeComment({ body: "Our family memory", canDelete: true, canEdit: true }),
  ],
});
type Props = {
  presentation: ItemPresentation;
  itemId?: string;
  isUnavailable?: boolean;
};

function Harness({
  presentation,
  itemId = ITEM_ID,
  isUnavailable = false,
}: Readonly<Props>): ReactNode {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const transport = useVideoTransport(itemId);
  const controller = useTheaterCommentDock({
    presentation,
    itemId,
    fieldRef,
    isUnavailable,
  });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          transport.setPosition(6.25);
        }}
      >
        Seek 6.25
      </button>
      <button
        type="button"
        onClick={() => {
          transport.setPosition(12.5);
        }}
      >
        Seek 12.5
      </button>
      <button type="button">Outside</button>
      <button type="button" onClick={controller.open}>
        Comment action
      </button>
      <TheaterCommentDock
        presentation={presentation}
        controller={controller}
        commentCount={1}
        isUnavailable={isUnavailable}
      >
        <ItemComments
          detail={{ ...DETAIL, itemId }}
          viewer={SIGNED_IN}
          transport={transport}
          fieldRef={fieldRef}
          presentation={presentation}
        />
      </TheaterCommentDock>
    </>
  );
}

function _renderDock(initialPresentation: ItemPresentation = "theater") {
  const client = makeQueryClientFromItemDetail(DETAIL);
  const tree = (
    presentation: ItemPresentation,
    itemId = ITEM_ID,
    isUnavailable = false,
  ) => {
    return (
      <MantineProvider theme={theme}>
        <QueryClientProvider client={client}>
          <ItemCommentDraftProvider>
            <Harness
              presentation={presentation}
              itemId={itemId}
              isUnavailable={isUnavailable}
            />
          </ItemCommentDraftProvider>
        </QueryClientProvider>
      </MantineProvider>
    );
  };
  const result = render(tree(initialPresentation));
  return {
    ...result,
    show: (
      presentation: ItemPresentation,
      itemId?: string,
      isUnavailable?: boolean,
    ) => {
      result.rerender(tree(presentation, itemId, isUnavailable));
    },
    field: result.container.querySelector("textarea")!,
    panel: result.container.querySelector<HTMLElement>(
      "[data-theater-comment-panel]",
    )!,
  };
}
function _bubble(): HTMLElement {
  return screen.getByLabelText("Open comments, 1 comment");
}
function _advance(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}
function _hover(element: HTMLElement): void {
  fireEvent.pointerEnter(element, { pointerType: "mouse" });
}
function _leave(element: HTMLElement, relatedTarget?: HTMLElement): void {
  fireEvent.pointerLeave(element, { pointerType: "mouse", relatedTarget });
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TheaterCommentDock", () => {
  it("preserves the actual composer node, full words and captured anchor through collapse and presentations", () => {
    vi.useFakeTimers();
    const view = _renderDock("page");
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
    _hover(_bubble());
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
    _leave(_bubble());
    _advance(450);
    _hover(_bubble());
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
    const { field, panel } = _renderDock();
    expect(panel).toHaveAttribute("inert");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    _hover(_bubble());
    expect(field).toHaveFocus();
    expect(panel).not.toHaveAttribute("inert");
    _leave(_bubble());
    _advance(449);
    expect(panel).not.toHaveAttribute("inert");
    const bubble = _bubble();
    let wasPanelInertAtFocus = false;
    bubble.addEventListener("focus", () => {
      wasPanelInertAtFocus = panel.hasAttribute("inert");
    });
    _advance(1);
    expect(panel).toHaveAttribute("inert");
    expect(bubble).toHaveFocus();
    expect(wasPanelInertAtFocus).toBe(true);
  });

  it("cancels departure on re-entry and crosses from bubble to panel without closing", () => {
    vi.useFakeTimers();
    const { panel } = _renderDock();
    _hover(_bubble());
    _leave(_bubble(), panel);
    _advance(500);
    expect(panel).not.toHaveAttribute("inert");
    _leave(panel);
    _advance(449);
    _hover(panel);
    _advance(1);
    expect(panel).not.toHaveAttribute("inert");
    _leave(panel);
    _advance(450);
    expect(panel).toHaveAttribute("inert");
  });

  it("pins explicit keyboard opening until focus departs and restores bubble focus on Escape", () => {
    vi.useFakeTimers();
    const { field, panel } = _renderDock();
    act(() => {
      _bubble().focus();
    });
    expect(panel).toHaveAttribute("inert");
    fireEvent.keyDown(_bubble(), { key: "ArrowUp" });
    expect(field).toHaveFocus();
    _leave(panel);
    _advance(1000);
    expect(panel).not.toHaveAttribute("inert");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(panel).toHaveAttribute("inert");
    expect(_bubble()).toHaveFocus();
    fireEvent.click(_bubble());
    act(() => {
      screen.getByRole("button", { name: "Outside" }).focus();
    });
    _advance(450);
    expect(panel).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });

  it("uses focus departure for explicit keyboard activation even with a pointer remaining inside", () => {
    vi.useFakeTimers();
    const { panel } = _renderDock();
    const bubble = _bubble();
    _hover(bubble);
    fireEvent.keyDown(bubble, { key: "ArrowUp" });
    act(() => {
      screen.getByRole("button", { name: "Outside" }).focus();
    });
    _advance(450);
    expect(panel).toHaveAttribute("inert");
  });

  it("restores focus to the bubble when item navigation collapses an open panel", () => {
    const view = _renderDock();
    fireEvent.click(_bubble());
    expect(view.field).toHaveFocus();
    view.show("theater", "other-item");
    expect(view.panel).toHaveAttribute("inert");
    expect(_bubble()).toHaveFocus();
  });

  it("opens explicitly from the existing Comment action and focuses the reused field", () => {
    const { field } = _renderDock();
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
    const { panel, field } = _renderDock();
    fireEvent.pointerEnter(_bubble(), { pointerType: "touch" });
    expect(panel).toHaveAttribute("inert");
    fireEvent.click(_bubble());
    expect(field).toHaveFocus();
  });

  it("owns the real reaction picker portal and lets its Escape close only the picker", async () => {
    vi.useFakeTimers();
    const { panel, container } = _renderDock();
    _hover(_bubble());
    fireEvent.click(screen.getByRole("button", { name: "Choose a reaction" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    const picker = screen.getByRole("dialog", { name: "Choose a reaction" });
    expect(
      container.querySelector("[data-theater-comment-portals]"),
    ).toContainElement(picker);
    expect(panel).not.toContainElement(picker);
    _leave(panel);
    _advance(1000);
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
    _advance(450);
    expect(panel).toHaveAttribute("inert");
  });

  it("holds the real delete dialog outside the scrolling panel until it closes", async () => {
    vi.useFakeTimers();
    const { panel, container } = _renderDock();
    _hover(_bubble());
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
    _leave(panel);
    _advance(1000);
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
    _advance(450);
    expect(panel).toHaveAttribute("inert");
  });

  it("preserves reply and edit instances and the scoped portal target across presentations", () => {
    const view = _renderDock("page");
    fireEvent.click(screen.getByRole("button", { name: /Reply to/ }));
    const reply = screen.getByRole("textbox", { name: /Reply to/ });
    fireEvent.change(reply, { target: { value: "My unfinished reply" } });
    const portal = view.container.querySelector(
      "[data-theater-comment-portals]",
    );
    view.show("theater");
    fireEvent.click(_bubble());
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
    fireEvent.click(_bubble());
    expect(screen.getByRole("textbox", { name: "What you wrote" })).toBe(
      editor,
    );
    expect(editor).toHaveValue("Edited but unsent");
  });

  it("resets openness on navigation, unavailability and leaving theater without stale timers", () => {
    vi.useFakeTimers();
    const view = _renderDock();
    _hover(_bubble());
    _leave(view.panel);
    view.show("theater", "other-item");
    expect(view.panel).toHaveAttribute("inert");
    fireEvent.click(_bubble());
    _advance(450);
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
