import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSeenLatch } from "@/surfaces/Timeline/useSeenLatch/useSeenLatch";

/** The observers the hook created, so a test can fire one. */
const observers: Array<
  (entries: Array<{ target: Element; isIntersecting: boolean }>) => void
> = [];

/** Every element the hook asked to be told about. */
const observed: Element[] = [];

beforeEach(() => {
  observers.length = 0;
  observed.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: unknown[]) => void) {
        observers.push(callback);
      }
      observe(target: Element) {
        observed.push(target);
      }
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Props = {
  onLatch: (body: unknown) => void;
  unseenById: ReadonlyMap<string, boolean>;
  /** Which prints are in the pile. Empty is a pile still loading. */
  prints?: readonly string[];
};

/** Mounts the hook against two prints so a test can fire its observer. */
function Harness({
  onLatch,
  unseenById,
  prints = ["i1", "b1"],
}: Readonly<Props>): ReactNode {
  const ref = useSeenLatch({ unseenById, onLatch });
  return (
    <div ref={ref}>
      {prints.includes("i1") ? (
        <button type="button" data-item-id="i1" />
      ) : null}
      {prints.includes("b1") ? (
        <button type="button" data-burst-id="b1" />
      ) : null}
    </div>
  );
}

describe("useSeenLatch", () => {
  it("sends nothing when everything on screen has already been seen", () => {
    const onLatch = vi.fn();
    const { container } = render(
      <Harness
        onLatch={onLatch}
        unseenById={
          new Map([
            ["i1", false],
            ["b1", false],
          ])
        }
      />,
    );
    act(() => {
      observers[0]?.([
        {
          target: container.querySelector("[data-item-id]")!,
          isIntersecting: true,
        },
      ]);
      vi.advanceTimersByTime(1000);
    });
    expect(onLatch).not.toHaveBeenCalled();
  });

  it("sends the batch once something in it is unseen", () => {
    const onLatch = vi.fn();
    const { container } = render(
      <Harness
        onLatch={onLatch}
        unseenById={
          new Map([
            ["i1", true],
            ["b1", false],
          ])
        }
      />,
    );
    act(() => {
      observers[0]?.([
        {
          target: container.querySelector("[data-item-id]")!,
          isIntersecting: true,
        },
      ]);
      vi.advanceTimersByTime(1000);
    });
    expect(onLatch).toHaveBeenCalledWith({ itemIds: ["i1"], burstIds: [] });
  });

  it("puts a stack's burst id in the batch and none of its frames", () => {
    const onLatch = vi.fn();
    const { container } = render(
      <Harness onLatch={onLatch} unseenById={new Map([["b1", true]])} />,
    );
    act(() => {
      observers[0]?.([
        {
          target: container.querySelector("[data-burst-id]")!,
          isIntersecting: true,
        },
      ]);
      vi.advanceTimersByTime(1000);
    });
    expect(onLatch).toHaveBeenCalledWith({ itemIds: [], burstIds: ["b1"] });
  });

  it("watches prints that arrive after the archive has mounted", async () => {
    // The real archive mounts empty: the day stream is still in flight, and
    // the infinite scroll appends another page every time somebody reaches
    // the foot of this one. A query run once, at mount, watches an empty
    // pile and nothing that lands in it afterwards.
    const onLatch = vi.fn();
    const unseenById = new Map([["i1", true]]);
    const { rerender } = render(
      <Harness onLatch={onLatch} unseenById={unseenById} prints={[]} />,
    );
    expect(observed).toHaveLength(0);

    await act(async () => {
      rerender(
        <Harness onLatch={onLatch} unseenById={unseenById} prints={["i1"]} />,
      );
    });

    expect(
      observed.map((element) => {
        return element.getAttribute("data-item-id");
      }),
    ).toEqual(["i1"]);
  });

  it("batches rather than sending one request per print", () => {
    const onLatch = vi.fn();
    const { container } = render(
      <Harness
        onLatch={onLatch}
        unseenById={
          new Map([
            ["i1", true],
            ["b1", true],
          ])
        }
      />,
    );
    act(() => {
      observers[0]?.([
        {
          target: container.querySelector("[data-item-id]")!,
          isIntersecting: true,
        },
        {
          target: container.querySelector("[data-burst-id]")!,
          isIntersecting: true,
        },
      ]);
      vi.advanceTimersByTime(1000);
    });
    expect(onLatch).toHaveBeenCalledTimes(1);
  });
});
