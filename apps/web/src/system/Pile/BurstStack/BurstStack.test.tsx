import { MantineProvider } from "@mantine/core";
import { render, screen, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BurstStack } from "@/system/Pile/BurstStack/BurstStack";
import { Pile } from "@/system/Pile/Pile";
import { makeItem } from "@/surfaces/Timeline/timelineFixtures";
import {
  makeBurstFrame,
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
  // The frames come from the burst's own route, so there is a moment between
  // the press and their arrival. A header over an empty run is not a state.
  it("stays collapsed while it has no frames, even asked to start open", () => {
    _render(
      <Pile>
        <BurstStack
          cover={makeItem()}
          frameCount={45}
          span="45 frames"
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
          frames={[makeBurstFrame(1), makeBurstFrame(2)]}
          frameCount={45}
          span="45 frames"
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
          frames={[makeBurstFrame(1), makeBurstFrame(2)]}
          frameCount={2}
          span="2 frames"
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
