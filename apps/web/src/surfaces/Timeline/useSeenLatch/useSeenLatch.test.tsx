import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSeenLatch } from "@/surfaces/Timeline/useSeenLatch/useSeenLatch";

/** The observers the hook created, so a test can fire one. */
const observers: Array<
  (entries: Array<{ target: Element; isIntersecting: boolean }>) => void
> = [];

beforeEach(() => {
  observers.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: unknown[]) => void) {
        observers.push(callback as never);
      }
      observe() {}
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
};

/** Mounts the hook against two prints so a test can fire its observer. */
function Harness({ onLatch, unseenById }: Readonly<Props>): ReactNode {
  const ref = useSeenLatch({ unseenById, onLatch });
  return (
    <div ref={ref}>
      <button type="button" data-item-id="i1" />
      <button type="button" data-burst-id="b1" />
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
