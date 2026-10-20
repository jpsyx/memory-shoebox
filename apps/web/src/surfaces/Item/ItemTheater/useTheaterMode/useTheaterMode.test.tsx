import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheaterMode } from "./useTheaterMode";

beforeEach(() => {
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => {
      return null;
    },
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: () => {
      return Promise.resolve();
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document, "exitFullscreen");
});

describe("theater mode ownership", () => {
  it("requests its stable host synchronously and survives fullscreen rejection", async () => {
    const onBeforeExit = vi.fn();
    const { result } = renderHook(() => {
      return useTheaterMode({ onBeforeExit });
    });
    const host = document.createElement("div");
    const requestFullscreen = vi.fn().mockRejectedValue(new Error("Denied"));
    host.requestFullscreen = requestFullscreen;
    result.current.hostRef.current = host;
    act(() => {
      result.current.enter();
      expect(requestFullscreen).toHaveBeenCalledOnce();
    });
    await act(async () => {});
    expect(result.current.presentation).toBe("theater");
    expect(result.current.isFullscreen).toBe(false);
    act(() => {
      return result.current.exit();
    });
    expect(onBeforeExit).toHaveBeenCalledOnce();
    expect(result.current.presentation).toBe("page");
  });

  it("keeps window theater on native fullscreen exit, and never exits another element", async () => {
    const { result, unmount } = renderHook(() => {
      return useTheaterMode({ onBeforeExit: vi.fn() });
    });
    const host = document.createElement("div");
    result.current.hostRef.current = host;
    let fullscreenElement: Element | null = null;
    vi.spyOn(document, "fullscreenElement", "get").mockImplementation(() => {
      return fullscreenElement;
    });
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(document, "exitFullscreen").mockImplementation(exitFullscreen);
    host.requestFullscreen = vi.fn().mockImplementation(async () => {
      fullscreenElement = host;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await act(async () => {
      return result.current.enter();
    });
    expect(result.current.isFullscreen).toBe(true);
    act(() => {
      fullscreenElement = null;
      fireEvent(document, new Event("fullscreenchange"));
    });
    expect(result.current.presentation).toBe("theater");
    expect(result.current.isFullscreen).toBe(false);
    fullscreenElement = document.createElement("video");
    act(() => {
      return result.current.exit();
    });
    unmount();
    expect(exitFullscreen).not.toHaveBeenCalled();
  });

  it("restores the pre-entry page scroll only after Back returns to page presentation", () => {
    let scrollY = 240;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => {
      return scrollY;
    });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { result } = renderHook(() => {
      return useTheaterMode({ onBeforeExit: vi.fn() });
    });
    act(() => {
      return result.current.enter();
    });
    // A fixed host can shrink the document and clamp its previous scroll.
    scrollY = 0;
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => {
      return result.current.exit();
    });
    expect(result.current.presentation).toBe("page");
    expect(scrollTo).toHaveBeenCalledWith({
      left: 0,
      top: 240,
      behavior: "instant",
    });
  });

  it("pauses and releases only owned fullscreen on unmount", async () => {
    const onBeforeExit = vi.fn();
    const { result, unmount } = renderHook(() => {
      return useTheaterMode({ onBeforeExit });
    });
    const host = document.createElement("div");
    result.current.hostRef.current = host;
    vi.spyOn(document, "fullscreenElement", "get").mockReturnValue(host);
    const exitFullscreen = vi
      .spyOn(document, "exitFullscreen")
      .mockResolvedValue(undefined);
    act(() => {
      return result.current.enter();
    });
    unmount();
    expect(onBeforeExit).toHaveBeenCalledOnce();
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });
});
