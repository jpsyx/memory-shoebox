import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arrivePhotoTransition,
  clearPhotoTransition,
  preparePhotoArrival,
  reconcilePhotoTransition,
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
    expect(animate).not.toHaveBeenCalled();
    arrivePhotoTransition(_makePhoto("viewer"), "photo-a");
    expect(document.querySelectorAll("[data-photo-flight]")).toHaveLength(1);
    expect(animate).toHaveBeenCalledOnce();
  });
  it("retains one inert print and hides preview and selected frames before flight", () => {
    const source = _makePhoto("pile");
    stagePhotoTransition(source, "photo-a");
    const layer = document.querySelector<HTMLElement>("[data-photo-flight]")!;
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer.inert).toBe(true);
    expect(source.dataset.photoArriving).toBe("true");
    history.replaceState({}, "", "/items/photo-a");
    const preview = _makePhoto("viewer");
    const detachPreview = preparePhotoArrival(preview, "photo-a");
    expect(preview.dataset.photoArriving).toBe("true");
    detachPreview();
    const selected = _makePhoto("viewer");
    const detachSelected = preparePhotoArrival(selected, "photo-a");
    expect(selected.dataset.photoArriving).toBe("true");
    expect(animate).not.toHaveBeenCalled();
    arrivePhotoTransition(selected, "photo-a");
    expect(document.querySelector("[data-photo-flight]")).toBe(layer);
    expect(layer.dataset.photoFlightPhase).toBe("moving");
    detachSelected();
    expect(source.dataset.photoArriving).toBeUndefined();
    expect(selected.dataset.photoArriving).toBeUndefined();
    expect(layer.isConnected).toBe(false);
  });
  it("reveals a slow or failed destination on expiry without a late flight", () => {
    const source = _makePhoto("pile");
    stagePhotoTransition(source, "photo-a");
    history.replaceState({}, "", "/items/photo-a");
    const target = _makePhoto("viewer");
    preparePhotoArrival(target, "photo-a");
    vi.advanceTimersByTime(1501);
    expect(target.dataset.photoArriving).toBeUndefined();
    expect(source.dataset.photoArriving).toBeUndefined();
    expect(document.querySelector("[data-photo-flight]")).toBeNull();
    arrivePhotoTransition(target, "photo-a");
    expect(animate).not.toHaveBeenCalled();
  });
  it.each(["wheel", "touchmove", "PageDown", "Escape"])(
    "cancels before decode when the viewer uses %s",
    (eventName) => {
      stagePhotoTransition(_makePhoto("pile"), "photo-a");
      history.replaceState({}, "", "/items/photo-a");
      const target = _makePhoto("viewer");
      preparePhotoArrival(target, "photo-a");
      window.dispatchEvent(
        eventName === "PageDown" || eventName === "Escape"
          ? new KeyboardEvent("keydown", { key: eventName })
          : new Event(eventName),
      );
      expect(target.dataset.photoArriving).toBeUndefined();
      expect(document.querySelector("[data-photo-flight]")).toBeNull();
      arrivePhotoTransition(target, "photo-a");
      expect(animate).not.toHaveBeenCalled();
    },
  );
  it("allows router scroll restoration before the destination is ready", () => {
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    window.dispatchEvent(new Event("scroll"));
    expect(document.querySelector("[data-photo-flight]")).not.toBeNull();
  });
  it("ignores old cleanup after another print replaces the journey", () => {
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    history.replaceState({}, "", "/items/photo-a");
    const release = arrivePhotoTransition(_makePhoto("viewer"), "photo-a");
    const finishOld = finish;
    stagePhotoTransition(_makePhoto("pile"), "photo-b");
    const retained = document.querySelector("[data-photo-flight]");
    release();
    finishOld();
    expect(document.querySelector("[data-photo-flight]")).toBe(retained);
  });
  it.each([
    "navigation",
    "resize",
    "scroll",
    "animation failure",
    "reduced motion",
  ])("restores the destination after %s interrupts the journey", (reason) => {
    stagePhotoTransition(_makePhoto("pile"), "photo-a");
    history.replaceState({}, "", "/items/photo-a");
    const target = _makePhoto("viewer");
    preparePhotoArrival(target, "photo-a");
    if (reason === "animation failure") {
      animate.mockImplementationOnce(() => {
        throw new Error("Unavailable");
      });
    }
    if (reason === "reduced motion") {
      vi.spyOn(window, "matchMedia").mockReturnValue({
        matches: true,
      } as MediaQueryList);
    }
    arrivePhotoTransition(target, "photo-a");
    if (reason === "navigation") {
      reconcilePhotoTransition("/account");
    } else if (reason === "resize" || reason === "scroll") {
      window.dispatchEvent(new Event(reason));
    }
    expect(target.dataset.photoArriving).toBeUndefined();
    expect(document.querySelector("[data-photo-flight]")).toBeNull();
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
