import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useRef } from "react";
import { makeDay, makeItem } from "../timelineFixtures";
import { useTimelineWindow } from "./useTimelineWindow";
import type { TimelineRenderRow } from "./timelineWindow.types";

it("preserves the reading item when a preceding measurement arrives before structural scroll readback", async () => {
  const heights = new Map<string, number>();
  const rows: TimelineRenderRow[] = Array.from({ length: 24 }, (_, index) => {
    const item = makeItem({ itemId: `item-${index}` });
    item.media = { ...item.media, width: 92, height: 82 };
    heights.set(item.itemId, 100);
    return {
      key: item.itemId,
      day: makeDay({ items: [item] }),
      itemIds: [item.itemId],
      items: [item],
      kind: "media",
      seedBase: index,
    };
  });
  const writes: number[] = [];
  vi.stubGlobal("innerWidth", 300);
  vi.stubGlobal("innerHeight", 200);
  vi.stubGlobal("scrollY", 800);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
    2400,
  );
  vi.spyOn(window, "scrollTo").mockImplementation(
    (options: number | ScrollToOptions, _top?: number) => {
      const offset = typeof options === "object" ? (options.top ?? 0) : options;
      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value: offset,
      });
      writes.push(offset);
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const root = this.closest<HTMLElement>("[data-window-root]");
      const row = this.closest<HTMLElement>("[data-timeline-row]");
      const origin = Number(root?.dataset.origin ?? 0);
      const top =
        origin + Number.parseFloat(row?.style.top || "0") - window.scrollY;
      const height = row
        ? (heights.get(row.dataset.timelineRow!) ?? 100)
        : 2400;
      return {
        x: 0,
        y: top,
        top,
        bottom: top + height,
        left: 0,
        right: 300,
        width: 300,
        height,
        toJSON: () => {
          return {};
        },
      };
    },
  );
  let current: ReturnType<typeof useTimelineWindow>;
  function Harness({
    retained,
    origin,
  }: {
    retained: TimelineRenderRow[];
    origin: number;
  }) {
    const element = useRef<HTMLDivElement>(null);
    current = useTimelineWindow({
      rows: retained,
      viewKey: "view",
      focusedItemId: "item-0",
      element,
      tileWidth: 102,
      viewportWidth: 300,
      isMobile: false,
    });
    return (
      <div ref={element} data-window-root data-origin={origin}>
        {current.positions.map((position) => {
          const row = retained[position.index]!;
          return (
            <div
              key={row.key}
              data-index={position.index}
              data-timeline-row={row.key}
              ref={current.virtualizer.measureElement}
              style={{
                top: position.start - current.virtualizer.options.scrollMargin,
              }}
            >
              <button data-item-id={row.itemIds[0]} />
            </div>
          );
        })}
      </div>
    );
  }
  try {
    const rendered = render(
      <Harness retained={rows.slice(0, 20)} origin={0} />,
    );
    const reading = rendered.container.querySelector<HTMLElement>(
      '[data-item-id="item-8"]',
    )!;
    const originalTop = reading.getBoundingClientRect().top;
    const focused = rendered.container.querySelector<HTMLElement>(
      '[data-item-id="item-0"]',
    )!;
    focused.focus({ preventScroll: true });
    rendered.rerender(
      <Harness retained={[rows[0]!, ...rows.slice(3, 22)]} origin={30} />,
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(
      Math.abs(reading.getBoundingClientRect().top - originalTop),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(current!.virtualizer.scrollOffset! - window.scrollY),
    ).toBeLessThanOrEqual(1);
    expect(reading.isConnected).toBe(true);
    const preceding = rendered.container.querySelector<HTMLElement>(
      '[data-timeline-row="item-7"]',
    )!;
    heights.set("item-7", 110);
    act(() => {
      current!.virtualizer.measureElement(preceding);
    });
    expect(
      current!.virtualizer.takeSnapshot().find((item) => {
        return item.key === "item-7";
      })?.size,
    ).toBe(110);
    expect(
      Math.abs(reading.getBoundingClientRect().top - originalTop),
    ).toBeLessThanOrEqual(2);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(
      Math.abs(reading.getBoundingClientRect().top - originalTop),
    ).toBeLessThanOrEqual(2);
    await act(async () => {
      await new Promise<void>((done) => {
        return requestAnimationFrame(() => {
          return requestAnimationFrame(() => {
            return done();
          });
        });
      });
    });
    expect(
      Math.abs(reading.getBoundingClientRect().top - originalTop),
    ).toBeLessThanOrEqual(2);
    expect(document.activeElement).toBe(focused);
    rendered.unmount();
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("waits for a newly measured header position to reach the DOM before consuming its structural anchor", async () => {
  const cover = makeItem({ itemId: "cover" });
  const day = makeDay({ items: [cover] });
  const ordinary: TimelineRenderRow[] = [
    { key: "day", kind: "header", day, items: [], itemIds: [], seedBase: 0 },
    {
      key: "cover",
      kind: "media",
      day,
      items: [cover],
      itemIds: ["cover"],
      seedBase: 0,
    },
    ...Array.from({ length: 12 }, (_, index) => {
      return {
        key: `tail-${index}`,
        kind: "media" as const,
        day,
        items: [makeItem({ itemId: `tail-${index}` })],
        itemIds: [`tail-${index}`],
        seedBase: index + 1,
      };
    }),
  ];
  const expanded: TimelineRenderRow[] = [
    ordinary[0]!,
    {
      key: "fan-header",
      kind: "header",
      day,
      items: [cover],
      itemIds: [],
      seedBase: 0,
      isFanHeader: true,
      burstId: "burst",
    },
    { ...ordinary[1]!, burstId: "burst" },
    ...ordinary.slice(2),
  ];
  const heights = new Map([
    ["day", 180],
    ["cover", 160],
    ["fan-header", 102],
    ["fan-first", 148],
  ]);
  vi.stubGlobal("innerWidth", 300);
  vi.stubGlobal("innerHeight", 300);
  vi.stubGlobal("scrollY", 100);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
    4000,
  );
  vi.spyOn(window, "scrollTo").mockImplementation(
    (options: number | ScrollToOptions) => {
      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value: typeof options === "object" ? (options.top ?? 0) : options,
      });
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const row = this.closest<HTMLElement>("[data-timeline-row]");
      const top = Number.parseFloat(row?.style.top ?? "0") - window.scrollY;
      const height = row
        ? (heights.get(row.dataset.timelineRow!) ?? 100)
        : 4000;
      return {
        x: 0,
        y: top,
        top,
        bottom: top + height,
        left: 0,
        right: 300,
        width: 300,
        height,
        toJSON() {
          return {};
        },
      };
    },
  );
  function Harness({ rows }: { rows: TimelineRenderRow[] }) {
    const element = useRef<HTMLDivElement>(null);
    const current = useTimelineWindow({
      rows,
      viewKey: "view",
      element,
      tileWidth: 200,
      viewportWidth: 300,
      isMobile: false,
    });
    return (
      <div ref={element}>
        {current.positions.map((position) => {
          const row = rows[position.index]!;
          return (
            <div
              key={row.key}
              data-index={position.index}
              data-timeline-row={row.key}
              ref={current.virtualizer.measureElement}
              style={{
                top:
                  current.measurements[position.index]!.start -
                  current.virtualizer.options.scrollMargin,
              }}
            >
              {row.itemIds.map((id) => {
                return <button key={id} data-item-id={id} />;
              })}
            </div>
          );
        })}
      </div>
    );
  }
  try {
    const rendered = render(<Harness rows={ordinary} />);
    const initial = rendered.container
      .querySelector<HTMLElement>('[data-item-id="cover"]')!
      .getBoundingClientRect().top;
    rendered.rerender(<Harness rows={expanded} />);
    await act(async () => {
      await new Promise<void>((done) => {
        return requestAnimationFrame(() => {
          return requestAnimationFrame(() => {
            return done();
          });
        });
      });
    });
    rendered.rerender(<Harness rows={expanded} />);
    const current = rendered.container
      .querySelector<HTMLElement>('[data-item-id="cover"]')!
      .getBoundingClientRect().top;
    expect(Math.abs(current - initial)).toBeLessThanOrEqual(2);
    rendered.unmount();
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
