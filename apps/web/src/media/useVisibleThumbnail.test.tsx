import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MediaLoadingContext } from "./MediaLoadingContext";
import {
  createMediaLoadingLifetime,
  createMediaLoadingResources,
} from "./createMediaLoadingResources";
import { PileItems } from "@/system/Pile/PileItems/PileItems";
import { makeItem } from "@/surfaces/Timeline/timelineFixtures";

function _setup() {
  const observers: Array<{
    callback: IntersectionObserverCallback;
    nodes: Set<Element>;
  }> = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry: (typeof observers)[number];
      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback, nodes: new Set() };
        observers.push(this.entry);
      }
      observe(node: Element) {
        this.entry.nodes.add(node);
      }
      unobserve(node: Element) {
        this.entry.nodes.delete(node);
      }
      disconnect() {
        this.entry.nodes.clear();
      }
    },
  );
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
  });
  const items = Array.from({ length: 12 }, (_, index) => {
    return makeItem({ itemId: `item-${index}` });
  });
  const view = render(
    <MediaLoadingContext value={resources}>
      <PileItems items={items.slice(0, 4)} />
      <PileItems items={items.slice(4, 8)} />
      <PileItems items={items.slice(8)} />
    </MediaLoadingContext>,
  );
  function intersect(ratio: number) {
    act(() => {
      observers.forEach(({ callback, nodes }) => {
        return callback(
          [...nodes].map((target) => {
            return {
              target,
              isIntersecting: true,
              intersectionRatio: ratio,
            } as IntersectionObserverEntry;
          }),
          {} as IntersectionObserver,
        );
      });
    });
  }
  return { ...view, resources, intersect };
}

afterEach(() => {
  return vi.unstubAllGlobals();
});

it("withholds unentered thumbnail sources even when mounted in overscan", () => {
  const setup = _setup();
  expect(setup.container.querySelectorAll("img[src]")).toHaveLength(0);
  setup.intersect(0);
  expect(setup.container.querySelectorAll("img[src]")).toHaveLength(0);
  setup.intersect(0.5);
  expect(setup.container.querySelectorAll("img[src]")).toHaveLength(12);
  setup.resources.dispose();
});

it("spends at most six eager thumbnails across multiple days", () => {
  const setup = _setup();
  setup.intersect(1);
  expect(setup.container.querySelectorAll('img[loading="eager"]')).toHaveLength(
    6,
  );
  setup.resources.dispose();
});
