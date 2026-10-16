import { MantineProvider } from "@mantine/core";
import { act, render, screen, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BurstStack } from "@/system/Pile/BurstStack/BurstStack";
import { PileSelectionContext } from "@/system/Pile/PileSelection/PileSelection";
import { Pile } from "@/system/Pile/Pile";
import { makeItem } from "@/surfaces/Timeline/timelineFixtureHelpers";
import {
  makeBurstFrameFromPosition,
  makeFrameIdFromPosition,
} from "@/testing/itemFixtureHelpers";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

/** The theme, around whatever is rendered. */
function _render(node: ReactNode): RenderResult {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

describe("a burst that has not been opened yet", () => {
  it("opens the burst when its photo-count label is clicked", async () => {
    const onOpen = vi.fn();
    _render(
      <BurstStack
        cover={makeItem()}
        frameCount={45}
        span="45 photos"
        seed={0}
        onOpen={onOpen}
      />,
    );

    await userEvent.click(screen.getByText(/45/));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  // The frames come from the burst's own route, so there is a moment between
  // the press and their arrival. A header over an empty run is not a state.
  it("stays collapsed while it has no frames, even asked to start open", () => {
    _render(
      <Pile>
        <BurstStack
          cover={makeItem()}
          frameCount={45}
          span="45 photos"
          seed={0}
          startOpen
        />
      </Pile>,
    );

    expect(screen.getByText(/45/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();
  });

  it("fans once somebody hands it the frames", () => {
    _render(
      <Pile>
        <BurstStack
          cover={makeItem()}
          frames={[
            makeBurstFrameFromPosition(1),
            makeBurstFrameFromPosition(2),
          ]}
          frameCount={45}
          span="45 photos"
          seed={0}
          startOpen
        />
      </Pile>,
    );

    expect(screen.getByRole("button", { name: "Collapse" })).toBeVisible();
  });

  it("opens a fanned frame in the viewer when it is pressed", async () => {
    const onOpenFrame = vi.fn();
    _render(
      <Pile>
        <BurstStack
          cover={makeItem()}
          frames={[
            makeBurstFrameFromPosition(1),
            makeBurstFrameFromPosition(2),
          ]}
          frameCount={2}
          span="2 photos"
          seed={0}
          startOpen
          onOpenFrame={onOpenFrame}
        />
      </Pile>,
    );

    const frames = screen.getAllByRole("button", {
      name: "Mateo, 14 September 2026",
    });
    await userEvent.click(frames[1]!);

    expect(onOpenFrame).toHaveBeenCalledWith(makeFrameIdFromPosition(2));
  });
});

describe("burst membership actions", () => {
  it("offers removal only for allowed photos and leaves photo navigation separate", async () => {
    const onRemoveFrame = vi.fn();
    const onOpenFrame = vi.fn();
    _render(
      <BurstStack
        cover={makeItem()}
        frames={[
          { ...makeBurstFrameFromPosition(1), canRemoveFromBurst: true },
          { ...makeBurstFrameFromPosition(2), canRemoveFromBurst: false },
          makeBurstFrameFromPosition(3),
        ]}
        frameCount={3}
        span="3 photos"
        seed={0}
        startOpen
        onRemoveFrame={onRemoveFrame}
        onOpenFrame={onOpenFrame}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Photo 2 options" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Photo 3 options" }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Photo 1 options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Make standalone" }),
    );
    expect(onRemoveFrame).toHaveBeenCalledWith(makeFrameIdFromPosition(1));
    expect(onOpenFrame).not.toHaveBeenCalled();
  });

  it("hides membership controls in selection mode and lets the photo toggle its tick", async () => {
    const onToggle = vi.fn();
    const frame = {
      ...makeBurstFrameFromPosition(1),
      canRemoveFromBurst: true,
    };
    _render(
      <PileSelectionContext
        value={{
          selectedItemIds: new Set(),
          framesByBurstId: new Map([["burst", [frame]]]),
          isBusy: false,
          onToggle,
          onOpenBurst: vi.fn(),
        }}
      >
        <BurstStack
          cover={makeItem()}
          frames={[frame]}
          frameCount={1}
          span="1 photo"
          seed={0}
          startOpen
          burstId="burst"
          onRemoveFrame={vi.fn()}
        />
      </PileSelectionContext>,
    );
    expect(
      screen.queryByRole("button", { name: "Photo 1 options" }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: frame.altText }));
    expect(onToggle).toHaveBeenCalledWith(frame.itemId);
  });
});

describe("closing a burst with the keyboard or its control", () => {
  it.each(["Collapse", "Escape"])(
    "returns focus to the cover after %s",
    async (action) => {
      _render(
        <BurstStack
          cover={makeItem()}
          frames={[
            makeBurstFrameFromPosition(1),
            makeBurstFrameFromPosition(2),
          ]}
          frameCount={2}
          span="Two photographs"
          seed={0}
          startOpen
        />,
      );
      const collapse = screen.getByRole("button", { name: "Collapse" });
      collapse.focus();
      if (action === "Escape") {
        await userEvent.keyboard("{Escape}");
      } else {
        await userEvent.click(collapse);
      }
      expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();
      expect(screen.getByRole("button", { name: /2 photos/ })).toHaveFocus();
    },
  );
});

it("retains the fan during exit and leaves another control's focus alone", async () => {
  const finishes: Array<() => void> = [];
  const animate = vi.fn(() => {
    return {
      finished: new Promise<void>((settle) => {
        finishes.push(settle);
      }),
      cancel: vi.fn(),
    };
  });
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  try {
    _render(
      <>
        <button>Elsewhere</button>
        <BurstStack
          cover={makeItem()}
          frames={[
            makeBurstFrameFromPosition(1),
            makeBurstFrameFromPosition(2),
          ]}
          frameCount={2}
          span="Two photographs"
          seed={0}
          startOpen
        />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(
      screen.getByRole("button", { name: "Collapse" }),
    ).toBeInTheDocument();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    await act(async () => {
      finishes.forEach((finish) => {
        finish();
      });
    });
    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();
    expect(elsewhere).toHaveFocus();
  } finally {
    delete (Element.prototype as Partial<Element>).animate;
  }
});

it("gathers from the current animated pose when interrupted", async () => {
  const animate = vi.fn(() => {
    return {
      finished: new Promise(() => {}),
      cancel: vi.fn(),
    };
  });
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  try {
    _render(
      <BurstStack
        cover={makeItem()}
        frames={[makeBurstFrameFromPosition(1)]}
        frameCount={1}
        span="One photograph"
        seed={0}
        startOpen
      />,
    );
    const photo = screen.getByRole("button", {
      name: makeBurstFrameFromPosition(1).altText,
    });
    photo.style.translate = "-12px 24px";
    photo.style.opacity = "0.6";
    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(animate.mock.lastCall).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({ translate: "-12px 24px", opacity: "0.6" }),
        ]),
      ]),
    );
  } finally {
    delete (Element.prototype as Partial<Element>).animate;
  }
});
