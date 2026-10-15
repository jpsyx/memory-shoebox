import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSeenLatch } from "@/surfaces/Timeline/useSeenLatch/useSeenLatch";

/** The observers the hook created, so a test can fire one. */
const observers: Array<
  (
    entries: Array<{
      target: Element;
      isIntersecting: boolean;
      intersectionRatio?: number;
    }>,
  ) => void
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
      unobserve() {}
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
  ownerKey?: string;
};

/** Mounts the hook against two prints so a test can fire its observer. */
function Harness({
  onLatch,
  unseenById,
  prints = ["i1", "b1"],
  ownerKey = "member-a/view-a",
}: Readonly<Props>): ReactNode {
  const ref = useSeenLatch({ unseenById, onLatch, ownerKey });
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
          intersectionRatio: 1,
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
          intersectionRatio: 1,
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
          intersectionRatio: 1,
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
          intersectionRatio: 1,
        },
        {
          target: container.querySelector("[data-burst-id]")!,
          isIntersecting: true,
          intersectionRatio: 1,
        },
      ]);
      vi.advanceTimersByTime(1000);
    });
    expect(onLatch).toHaveBeenCalledTimes(1);
  });
});

it("overscan and edge-only intersection are not seen", () => {
  const onLatch = vi.fn();
  const { container } = render(
    <Harness onLatch={onLatch} unseenById={new Map([["i1", true]])} />,
  );
  act(() => {
    observers[0]?.([
      {
        target: container.querySelector("[data-item-id]")!,
        isIntersecting: true,
        intersectionRatio: 0,
      },
    ]);
    vi.advanceTimersByTime(1000);
  });
  expect(onLatch).not.toHaveBeenCalled();
});

it("flushes during continuous visibility and never loses overflow after duplicate entries", () => {
  const onLatch = vi.fn();
  const ids = Array.from({ length: 1201 }, (_, index) => {
    return `visible-${index}`;
  });
  const unseenById = new Map(
    ids.map((id) => {
      return [id, true];
    }),
  );
  const { container } = render(
    <Harness onLatch={onLatch} unseenById={unseenById} />,
  );
  const entries = ids.map((id) => {
    const target = document.createElement("button");
    target.dataset.itemId = id;
    container.firstElementChild!.append(target);
    return { target, isIntersecting: true, intersectionRatio: 1 };
  });
  act(() => {
    observers[0]?.([...entries, ...entries]);
    Array.from({ length: 8 }).forEach(() => {
      vi.advanceTimersByTime(100);
      observers[0]?.([entries[0]!]);
    });
  });
  expect(onLatch).toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  const sent = onLatch.mock.calls.flatMap(([body]) => {
    return body.itemIds as string[];
  });
  expect(new Set(sent)).toEqual(new Set(ids));
  expect(
    onLatch.mock.calls.every(([body]) => {
      return body.itemIds.length <= 500;
    }),
  ).toBe(true);
});

it("retired view callbacks cannot enqueue sightings under another member", () => {
  const retiredLatch = vi.fn();
  const currentLatch = vi.fn();
  const unseenById = new Map([["i1", true]]);
  const { container, rerender, unmount } = render(
    <Harness onLatch={retiredLatch} unseenById={unseenById} />,
  );
  const entries = [
    {
      target: container.querySelector("[data-item-id]")!,
      isIntersecting: true,
      intersectionRatio: 1,
    },
  ];
  const retiredObserver = observers[0]!;
  act(() => {
    retiredObserver(entries);
  });
  rerender(
    <Harness
      onLatch={currentLatch}
      unseenById={unseenById}
      ownerKey="member-b/view-b"
    />,
  );
  act(() => {
    retiredObserver(entries);
    vi.advanceTimersByTime(1000);
  });
  expect(retiredLatch).not.toHaveBeenCalled();
  expect(currentLatch).not.toHaveBeenCalled();
  const currentObserver = observers.at(-1)!;
  unmount();
  act(() => {
    currentObserver(entries);
    vi.advanceTimersByTime(1000);
  });
  expect(currentLatch).not.toHaveBeenCalled();
});

it("familiar-only intersections allocate no pending flush", () => {
  const onLatch = vi.fn();
  const { container } = render(
    <Harness onLatch={onLatch} unseenById={new Map([["i1", false]])} />,
  );
  act(() => {
    observers[0]?.([
      {
        target: container.querySelector("[data-item-id]")!,
        isIntersecting: true,
        intersectionRatio: 1,
      },
    ]);
  });
  expect(vi.getTimerCount()).toBe(0);
  expect(onLatch).not.toHaveBeenCalled();
});

it("drains every unique sighting beyond both API limits without dropping the tail", () => {
  const onLatch = vi.fn();
  const ids = Array.from({ length: 1102 }, (_, index) => {
    return `visible-${index}`;
  });
  const { container } = render(
    <Harness
      onLatch={onLatch}
      unseenById={
        new Map(
          ids.map((id) => {
            return [id, true];
          }),
        )
      }
    />,
  );
  const entries = ids.map((id, index) => {
    const target = document.createElement("button");
    target.dataset[index % 2 === 0 ? "itemId" : "burstId"] = id;
    container.firstElementChild!.append(target);
    return { target, isIntersecting: true, intersectionRatio: 1 };
  });
  act(() => {
    observers[0]?.([...entries, ...entries]);
    vi.advanceTimersByTime(2000);
  });
  const sent = onLatch.mock.calls.flatMap(([body]) => {
    return [...body.itemIds, ...body.burstIds] as string[];
  });
  expect(new Set(sent)).toEqual(new Set(ids));
  expect(
    onLatch.mock.calls.every(([body]) => {
      return body.itemIds.length <= 500 && body.burstIds.length <= 500;
    }),
  ).toBe(true);
});
