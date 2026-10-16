// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getControlledVisualImagesFromDocument } from "../occasions-and-removals/support/controlledVisualMediaHelpers.ts";

let observations: IntersectionObserverCallback;
const targets: Element[] = [];
const disconnect = vi.fn();
beforeEach(() => {
  targets.length = 0;
  document.body.replaceChildren();
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observations = callback;
      }
      observe(target: Element) {
        targets.push(target);
      }
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function _intersect(isIntersecting: boolean): void {
  observations(
    targets.map((target) => {
      return {
        target,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
        time: 0,
      };
    }),
    {} as IntersectionObserver,
  );
}
function _imageFixture(): HTMLImageElement {
  const owner = document.createElement("button");
  owner.dataset.photoSurface = "pile";
  owner.dataset.itemId = "controlled-item";
  const image = document.createElement("img");
  image.alt = "Family at home";
  owner.append(image);
  document.body.append(owner);
  return image;
}
function _admit(image: HTMLImageElement): void {
  image.src = "https://visual-media.invalid/highChair-thumb.jpg";
  Object.defineProperties(image, {
    currentSrc: {
      configurable: true,
      get: () => {
        return image.src;
      },
    },
    complete: { configurable: true, value: true },
    naturalWidth: { configurable: true, value: 400 },
  });
}
it("observes the actual source owner and rejects readiness before admission or decode", async () => {
  const image = _imageFixture();
  image.decode = vi.fn().mockResolvedValue(undefined);
  const before = getControlledVisualImagesFromDocument();
  await Promise.resolve();
  expect(targets).toEqual([image.parentElement]);
  _intersect(true);
  expect(await before).toMatchObject([
    { isIntersecting: true, source: undefined, decoded: false },
  ]);
  expect(image.decode).not.toHaveBeenCalled();
  _admit(image);
  let finish!: () => void;
  image.decode = vi.fn(() => {
    return new Promise<void>((done) => {
      finish = done;
    });
  });
  let settled = false;
  const loading = getControlledVisualImagesFromDocument().then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  _intersect(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  finish();
  expect(await loading).toMatchObject([
    { isIntersecting: true, decoded: true, owner: "controlled-item" },
  ]);
});
it("records only independently nonintersecting source-less images as withheld", async () => {
  _imageFixture();
  const pending = getControlledVisualImagesFromDocument();
  await Promise.resolve();
  _intersect(false);
  expect(await pending).toMatchObject([
    {
      isIntersecting: false,
      source: undefined,
      currentSource: "",
      decoded: false,
    },
  ]);
  expect(disconnect).toHaveBeenCalledOnce();
});
it("does not hide a failed admitted source even outside the viewport", async () => {
  const image = _imageFixture();
  _admit(image);
  image.decode = vi.fn().mockRejectedValue(new Error("native decode failed"));
  const pending = getControlledVisualImagesFromDocument();
  await Promise.resolve();
  _intersect(false);
  await expect(pending).rejects.toThrow("native decode failed");
});
