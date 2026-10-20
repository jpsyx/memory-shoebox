import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderItem } from "@/testing/itemHarnessHelpers";
import {
  FIRST,
  LAST,
  MIDDLE,
  respondWithNavigationItems,
  waitForNavigationReady,
} from "./ItemNavigationTestHelpers";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLMediaElement.prototype, "audioTracks", {
    configurable: true,
    get: () => {
      return new EventTarget();
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLMediaElement.prototype, "audioTracks");
});

describe("theater media shortcuts", () => {
  it("allows arrows on the video picture inside its owned modal host", async () => {
    respondWithNavigationItems();
    const { router } = renderItem(MIDDLE.itemId);
    await waitForNavigationReady();
    await userEvent.click(
      screen.getByRole("button", { name: "Enter theater" }),
    );
    const picture = screen.getAllByRole("button", { name: "Play video" })[0]!;
    picture.focus();
    fireEvent.keyDown(picture, { key: "ArrowRight" });
    await waitFor(() => {
      return expect(router.state.location.pathname).toBe(
        `/items/${LAST.itemId}`,
      );
    });
  });

  it("allows only its owned native fullscreen and remains in theater after browser fullscreen exit", async () => {
    respondWithNavigationItems({
      routes: {
        [`GET /api/items/${MIDDLE.itemId}/video-reactions`]: {
          status: 200,
          body: [],
        },
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    await userEvent.click(
      screen.getByRole("button", { name: "Enter theater" }),
    );
    const theater = screen.getByRole("dialog", { name: "Media theater" });
    let fullscreenElement: Element | null = theater;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => {
        return fullscreenElement;
      },
    });
    try {
      act(() => {
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      expect(
        screen.getByRole("button", { name: "Leave fullscreen" }),
      ).toBeInTheDocument();
      fireEvent.keyDown(theater, { key: "ArrowRight" });
      await waitForNavigationReady();
      expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
      fullscreenElement = document.createElement("video");
      fireEvent.keyDown(theater, { key: "ArrowRight" });
      expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
      fullscreenElement = null;
      act(() => {
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(
        theater,
      );
      fireEvent.keyDown(theater, { key: "ArrowRight" });
      await waitFor(() => {
        return expect(router.state.location.pathname).toBe(
          `/items/${LAST.itemId}`,
        );
      });
    } finally {
      Reflect.deleteProperty(document, "fullscreenElement");
    }
  });

  it("retains slider, speed menu and nested dialog keys and ignores repeated events", async () => {
    respondWithNavigationItems();
    const { router } = renderItem(MIDDLE.itemId);
    await waitForNavigationReady();
    await userEvent.click(
      screen.getByRole("button", { name: "Enter theater" }),
    );
    const theater = screen.getByRole("dialog", { name: "Media theater" });
    for (const role of ["slider", "menu", "listbox", "dialog"]) {
      const control = document.createElement("div");
      control.setAttribute("role", role);
      theater.append(control);
      fireEvent.keyDown(control, { key: "ArrowRight" });
      control.remove();
    }
    fireEvent.keyDown(theater, { key: "ArrowRight", repeat: true });
    expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    fireEvent.keyDown(theater, { key: "ArrowLeft" });
    await waitFor(() => {
      return expect(router.state.location.pathname).toBe(
        `/items/${FIRST.itemId}`,
      );
    });
  });

  it("retains first/last bounds while theater remains open", async () => {
    respondWithNavigationItems();
    const { router } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    await userEvent.click(
      screen.getByRole("button", { name: "Enter theater" }),
    );
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Media theater" }), {
      key: "ArrowLeft",
    });
    expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
    await userEvent.click(
      screen.getByRole("button", { name: "Next photo or video" }),
    );
    await waitForNavigationReady();
    await userEvent.click(
      screen.getByRole("button", { name: "Next photo or video" }),
    );
    await waitFor(() => {
      return expect(
        screen.getByRole("button", { name: "Next photo or video" }),
      ).toHaveAttribute("aria-disabled", "true");
    });
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Media theater" }), {
      key: "ArrowRight",
    });
    expect(router.state.location.pathname).toBe(`/items/${LAST.itemId}`);
  });
});
