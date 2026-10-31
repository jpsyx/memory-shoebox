import { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTimelineBurstMotion } from "./useTimelineBurstMotion";
import { animateBurstPhotos } from "@/system/motion/burstMotionHelpers";

vi.mock("@/system/motion/burstMotionHelpers", () => {
  return {
    getBurstOriginFromElement: () => {
      return { x: 20, y: 20 };
    },
    getBurstFramesFromElement: () => {
      return new Map();
    },
    animateBurstPhotos: vi.fn(() => {
      return [];
    }),
  };
});

function Harness({ hasPhotos = false, onCollapsed = vi.fn() }) {
  const element = useRef<HTMLDivElement>(null);
  const motion = useTimelineBurstMotion(element);
  return (
    <div ref={element} onClickCapture={motion.capture}>
      <div data-burst-stack data-burst-id="first">
        <button data-photo-surface="pile">Open</button>
      </div>
      {["first", "second"].map((burstId) => {
        return (
          <div key={burstId} data-timeline-fan={burstId}>
            {hasPhotos ? <div data-photo-surface="pile" /> : null}
            <button
              onClick={() => {
                motion.collapse(burstId, () => {
                  onCollapsed(burstId);
                });
              }}
            >
              Close {burstId}
            </button>
          </div>
        );
      })}
    </div>
  );
}

describe("virtualized burst motion", () => {
  it("animates photos arriving after the fan header", () => {
    vi.mocked(animateBurstPhotos).mockClear();
    const view = render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    view.rerender(<Harness hasPhotos />);
    expect(animateBurstPhotos).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      { x: 20, y: 20 },
      false,
    );
  });

  it("finishes two independent collapses", async () => {
    const finishes: Array<() => void> = [];
    vi.mocked(animateBurstPhotos).mockImplementation(() => {
      return [
        {
          cancel: vi.fn(),
          finished: new Promise<void>((resolve) => {
            finishes.push(resolve);
          }),
        } as unknown as Animation,
      ];
    });
    const onCollapsed = vi.fn();
    render(<Harness hasPhotos onCollapsed={onCollapsed} />);
    fireEvent.click(screen.getByText("Close first"));
    fireEvent.click(screen.getByText("Close second"));
    await act(async () => {
      finishes.forEach((finish) => {
        finish();
      });
    });
    expect(onCollapsed.mock.calls).toEqual([["first"], ["second"]]);
  });
});
