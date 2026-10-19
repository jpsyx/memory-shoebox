import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arrivePhotoTransition,
  clearPhotoTransition,
  stagePhotoTransition,
} from "./photoTransition";

function _makePhoto(surface: "pile" | "viewer"): HTMLDivElement {
  const element = document.createElement("div");
  element.dataset.photoSurface = surface;
  const image = document.createElement("img");
  image.src = "/family.jpg";
  Object.defineProperties(image, {
    complete: { value: true },
    naturalWidth: { value: 800 },
  });
  element.append(image);
  document.body.append(element);
  return element;
}

describe("a print travelling to its own destination", () => {
  const cancel = vi.fn();
  let finish: () => void;
  const animate = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    animate.mockImplementation(() => {
      return {
        finished: new Promise<void>((settle) => {
          finish = settle;
        }),
        cancel,
      };
    });
    vi.stubGlobal("Animation", function Animation() {});
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    history.replaceState({}, "", "/");
  });
  afterEach(() => {
    clearPhotoTransition();
    document.body.replaceChildren();
    delete (Element.prototype as Partial<Element>).animate;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    animate.mockClear();
    cancel.mockClear();
  });
  it("animates only the matching item on the destination surface", () => {
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    history.replaceState({}, "", "/items/photo-a");
    arrivePhotoTransition(_makePhoto("viewer"), "photo-b");
    expect(document.querySelector("[data-photo-flight]")).toBeNull();
    arrivePhotoTransition(_makePhoto("viewer"), "photo-a");
    expect(document.querySelectorAll("[data-photo-flight]")).toHaveLength(1);
    expect(animate).toHaveBeenCalledOnce();
  });
  it("carries the destination paper, shadow and image backdrop into the flight", () => {
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    history.replaceState({}, "", "/items/photo-a");
    const target = _makePhoto("viewer");
    target.style.backgroundColor = "rgb(250, 251, 252)";
    target.style.boxShadow = "2px 4px 8px rgb(10, 20, 30)";
    target.style.padding = "10px";
    target.querySelector("img")!.style.backgroundColor = "rgb(190, 205, 230)";
    arrivePhotoTransition(target, "photo-a");
    const flight = document.querySelector<HTMLElement>("[data-photo-flight]")!;
    expect(flight.style.backgroundColor).toBe(target.style.backgroundColor);
    expect(flight.style.boxShadow).toBe(target.style.boxShadow);
    expect(flight.querySelector("img")!.style.backgroundColor).toBe(
      "rgb(190, 205, 230)",
    );
    expect(flight.style.boxSizing).toBe("border-box");
  });
  it("restores the destination after completion and never leaves a duplicate", async () => {
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    history.replaceState({}, "", "/items/photo-a");
    const target = _makePhoto("viewer");
    arrivePhotoTransition(target, "photo-a");
    expect(target.dataset.photoArriving).toBe("true");
    finish();
    await Promise.resolve();
    expect(target.dataset.photoArriving).toBeUndefined();
    expect(document.querySelector("[data-photo-flight]")).toBeNull();
  });
  it("releases an interrupted flight when its cleanup runs", () => {
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    history.replaceState({}, "", "/items/photo-a");
    const target = _makePhoto("viewer");
    const release = arrivePhotoTransition(target, "photo-a");
    release();
    expect(cancel).toHaveBeenCalled();
    expect(target.dataset.photoArriving).toBeUndefined();
    expect(document.querySelector("[data-photo-flight]")).toBeNull();
  });
  it("expires a snapshot before an unrelated later visit", () => {
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    vi.advanceTimersByTime(1600);
    history.replaceState({}, "", "/items/photo-a");
    arrivePhotoTransition(_makePhoto("viewer"), "photo-a");
    expect(animate).not.toHaveBeenCalled();
  });
  it("leaves the photograph visible when reduced motion is requested", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    history.replaceState({}, "", "/items/photo-a");
    const target = _makePhoto("viewer");
    arrivePhotoTransition(target, "photo-a");
    expect(animate).not.toHaveBeenCalled();
    expect(target.dataset.photoArriving).toBeUndefined();
  });
  it("does not reuse a snapshot on the same surface or a different route", () => {
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    arrivePhotoTransition(_makePhoto("pile"), "photo-a");
    history.replaceState({}, "", "/account");
    arrivePhotoTransition(_makePhoto("viewer"), "photo-a");
    expect(animate).not.toHaveBeenCalled();
  });
});
