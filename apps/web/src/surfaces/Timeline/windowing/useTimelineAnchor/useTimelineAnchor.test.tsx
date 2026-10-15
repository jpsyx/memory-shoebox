import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { makeDay, makeItem } from "../../timelineFixtures";
import type { TimelineRenderRow } from "../timelineWindow.types";
import {
  useTimelineAnchorEffects,
  useTimelineAnchorState,
} from "./useTimelineAnchor";

const item = makeItem({ itemId: "reading" });
const original: TimelineRenderRow[] = [
  {
    key: "reading-row",
    day: makeDay({ items: [item] }),
    items: [item],
    itemIds: [item.itemId],
    kind: "media",
    seedBase: 0,
  },
];
const replacement = [...original];
function _position(start: number): VirtualItem {
  return {
    key: "reading-row",
    index: 0,
    start,
    end: start + 100,
    size: 100,
    lane: 0,
  };
}

function _fixture() {
  vi.stubGlobal("innerWidth", 300);
  vi.stubGlobal("innerHeight", 500);
  vi.stubGlobal("scrollY", 0);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const top = Number(this.dataset.top ?? 0);
      return {
        top,
        y: top,
        bottom: top + 100,
        left: 0,
        right: 300,
        x: 0,
        width: 300,
        height: 100,
        toJSON() {
          return {};
        },
      };
    },
  );
  const correctOffset = vi.fn();
  const virtualizer = {
    options: { scrollMargin: 10 },
    getVirtualItems: () => {
      return [_position(112)];
    },
  } as unknown as Virtualizer<Window, HTMLElement>;
  let state!: ReturnType<typeof useTimelineAnchorState>;
  function Harness({
    rows = original,
    viewKey = "view",
    width = 300,
    painted = 74,
  }: {
    rows?: TimelineRenderRow[];
    viewKey?: string;
    width?: number;
    painted?: number;
  }) {
    const element = useRef<HTMLDivElement>(null);
    const options = {
      rows,
      viewKey,
      viewportWidth: width,
      tileWidth: 200,
      isMobile: false,
      element,
    };
    state = useTimelineAnchorState(options);
    useTimelineAnchorEffects(options, virtualizer, state, correctOffset, {
      measurements: [_position(painted)],
      scrollMargin: 10,
    });
    return (
      <div ref={element}>
        {rows.length > 0 && (
          <button
            data-item-id="reading"
            data-top={
              viewKey === "replacement" ? 200 : rows === original ? 40 : 100
            }
          />
        )}
      </div>
    );
  }
  const rendered = render(<Harness />);
  rendered.rerender(<Harness rows={replacement} />);
  expect(state.pendingAnchor.current?.itemId).toBe("reading");
  expect(correctOffset).not.toHaveBeenCalled();
  return {
    rendered,
    Harness,
    correctOffset,
    getState: () => {
      return state;
    },
    virtualizer,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["wheel", "touchstart", "ArrowDown", "PageDown", "Tab"])(
  "retires an unpainted structural correction on real %s reading intent",
  (event) => {
    const { rendered, Harness, correctOffset, getState } = _fixture();
    act(() => {
      return window.dispatchEvent(
        event === "wheel" || event === "touchstart"
          ? new Event(event)
          : new KeyboardEvent("keydown", { key: event }),
      );
    });
    expect(getState().pendingAnchor.current).toBeUndefined();
    rendered.rerender(<Harness rows={replacement} painted={112} />);
    expect(correctOffset).not.toHaveBeenCalled();
  },
);

it.each(["scroll", "x"])(
  "does not mistake %s for a new reading intent",
  (event) => {
    const { rendered, Harness, correctOffset } = _fixture();
    act(() => {
      return window.dispatchEvent(
        event === "scroll"
          ? new Event("scroll")
          : new KeyboardEvent("keydown", { key: event }),
      );
    });
    rendered.rerender(<Harness rows={replacement} painted={112} />);
    expect(correctOffset).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      60,
    );
  },
);

it("releases a removed reading row without retaining a pending correction", () => {
  const { rendered, Harness, correctOffset, getState } = _fixture();
  rendered.rerender(<Harness rows={[]} />);
  expect(getState().pendingAnchor.current).toBeUndefined();
  expect(correctOffset).not.toHaveBeenCalled();
});

it("retires the old view before the replacement coordinate commit", () => {
  const { rendered, Harness, correctOffset, getState } = _fixture();
  rendered.rerender(
    <Harness rows={[...replacement]} viewKey="replacement" painted={112} />,
  );
  expect(getState().pendingAnchor.current).toBeUndefined();
  expect(correctOffset).not.toHaveBeenCalled();
});

it("waits for the matching width generation then corrects once", () => {
  const { rendered, Harness, correctOffset, getState } = _fixture();
  rendered.rerender(<Harness rows={replacement} width={320} painted={112} />);
  expect(getState().pendingAnchor.current?.itemId).toBe("reading");
  expect(correctOffset).not.toHaveBeenCalled();
  vi.stubGlobal("innerWidth", 320);
  rendered.rerender(<Harness rows={replacement} width={320} painted={112} />);
  expect(correctOffset).toHaveBeenCalledExactlyOnceWith(expect.anything(), 60);
  expect(getState().pendingAnchor.current).toBeUndefined();
});

it("compares positions using the captured rendered origin", () => {
  const { rendered, Harness, correctOffset, virtualizer } = _fixture();
  virtualizer.options.scrollMargin = 48;
  rendered.rerender(<Harness rows={replacement} painted={74} />);
  expect(correctOffset).toHaveBeenCalledExactlyOnceWith(expect.anything(), 60);
});
