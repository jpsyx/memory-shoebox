import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ItemSummary, MediaRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Archive } from "@/system/Pile/Archive";
import { BurstStack } from "@/system/Pile/BurstStack";
import { DayRow } from "@/system/Pile/DayRow";
import { DaySpine } from "@/system/Pile/DaySpine";
import { MilestoneBand } from "@/system/Pile/MilestoneBand";
import { MilestoneContinues } from "@/system/Pile/MilestoneContinues";
import { Pile } from "@/system/Pile/Pile";
import { PileItems } from "@/system/Pile/PileItems";
import { scatterStyle } from "@/system/Pile/scatterStyle";
import type {
  DayMilestoneBand,
  TimelineDay,
} from "@/system/Pile/timeline.types";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

function _source(url: string) {
  return {
    url,
    expiresAt: "2026-09-28T13:00:00.000Z",
    width: 800,
    height: 600,
  };
}

function _media(overrides: Partial<MediaRef> = {}): MediaRef {
  return {
    thumb: _source("https://example.test/t.jpg"),
    display: _source("https://example.test/d.jpg"),
    poster: null,
    video: null,
    durationMs: null,
    altText: "Mateo on the day he was born",
    ...overrides,
  };
}

function _item(overrides: Partial<ItemSummary> = {}): ItemSummary {
  return {
    itemId: "i1",
    kind: "photo",
    capturedAt: "2026-09-14T06:41:00.000Z",
    capturedOn: "2026-09-14",
    media: _media(),
    isUnseen: false,
    uploadedBy: { memberId: "m1", displayName: "Papá" },
    visibility: { mode: "everyone", label: null, subjects: [] },
    burst: null,
    ...overrides,
  };
}

const DAY: TimelineDay = {
  capturedOn: "2026-09-14",
  itemCount: 212,
  unseenCount: 31,
  milestoneBand: null,
  milestoneStrips: [],
  items: [_item()],
};

function _render(node: ReactNode) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

describe("the spine", () => {
  it("splits the date into a figure and a month", () => {
    _render(
      <Archive>
        <DayRow>
          <DaySpine day={DAY} />
        </DayRow>
      </Archive>,
    );

    expect(screen.getByText("14")).toBeVisible();
    expect(screen.getByText("September")).toBeVisible();
  });

  it("carries the unseen count with a word beside it, never colour alone", () => {
    _render(
      <Archive>
        <DayRow>
          <DaySpine day={DAY} />
        </DayRow>
      </Archive>,
    );

    expect(screen.getByText("31 new")).toBeVisible();
  });

  it("says nothing about unseen when there is nothing unseen", () => {
    _render(
      <Archive>
        <DayRow>
          <DaySpine day={{ ...DAY, unseenCount: 0 }} />
        </DayRow>
      </Archive>,
    );

    expect(screen.queryByText(/new$/)).toBeNull();
  });
});

describe("the pile", () => {
  it("draws a print with its generated alt text, never null", () => {
    _render(
      <Pile>
        <PileItems items={DAY.items} />
      </Pile>,
    );

    expect(
      screen.getByAltText("Mateo on the day he was born"),
    ).toBeInTheDocument();
  });

  it("draws a video's runtime from durationMs", () => {
    _render(
      <Pile>
        <PileItems
          items={[
            _item({
              itemId: "i2",
              kind: "video",
              media: _media({ durationMs: 22_000 }),
            }),
          ]}
        />
      </Pile>,
    );

    expect(screen.getByText("0:22")).toBeVisible();
  });

  it("draws a burst as one print among the day's items, not one per frame", () => {
    _render(
      <Pile>
        <PileItems
          items={[
            _item({ itemId: "i1" }),
            _item({
              itemId: "i2",
              burst: {
                burstId: "b1",
                visibleFrameCount: 45,
                startsAt: "2026-09-14T06:41:00.000Z",
                endsAt: "2026-09-14T06:41:30.000Z",
                coverItemId: "i2",
              },
            }),
            _item({ itemId: "i3" }),
          ]}
        />
      </Pile>,
    );

    // Three items, one of them a 45-frame burst: an uncollapsed burst would
    // draw 45 images for that one item, for 47 in total. Collapsed, it draws
    // its cover only, so the pile draws exactly one image per item.
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText(/45/)).toBeVisible();
  });

  it("labels a restricted print with the rule's own words", () => {
    _render(
      <Pile>
        <PileItems
          items={[
            _item({
              visibility: {
                mode: "only",
                label: "Just us two",
                subjects: [],
              },
            }),
          ]}
        />
      </Pile>,
    );

    expect(screen.getByText("Just us two")).toBeVisible();
  });
});

const ONE_DAY_BAND: DayMilestoneBand = {
  milestone: {
    milestoneId: "ms1",
    name: "Mateo is born",
    startsOn: "2026-09-14",
    endsOn: "2026-09-14",
    blurb: "6:41 in the morning, three weeks early and in a hurry.",
  },
  dayPosition: 1,
  dayCount: 1,
  itemCount: 212,
};

describe("a milestone in the timeline", () => {
  it("opens with its name, its dates and its own total", () => {
    _render(<MilestoneBand band={ONE_DAY_BAND} />);

    expect(screen.getByText("Mateo is born")).toBeVisible();
    expect(screen.getByText("14 September 2026")).toBeVisible();
    expect(screen.getByText("212 items")).toBeVisible();
  });

  it("says nothing about a span when the occasion lasted one day", () => {
    _render(<MilestoneBand band={ONE_DAY_BAND} />);

    expect(screen.queryByText(/days/)).toBeNull();
    expect(screen.queryByText(/This day is day/)).toBeNull();
  });

  it("says which day of the span this is when it ran for several", () => {
    _render(
      <MilestoneBand
        band={{
          ...ONE_DAY_BAND,
          milestone: { ...ONE_DAY_BAND.milestone, endsOn: "2026-09-18" },
          dayPosition: 2,
          dayCount: 5,
        }}
      />,
    );

    expect(screen.getByText("5 days")).toBeVisible();
    expect(screen.getByText(/This day is day/)).toHaveTextContent(
      "This day is day 2 of the 5.",
    );
  });

  it("leaves the blurb out rather than printing nothing for it", () => {
    _render(
      <MilestoneBand
        band={{
          ...ONE_DAY_BAND,
          milestone: { ...ONE_DAY_BAND.milestone, blurb: null },
        }}
      />,
    );

    expect(screen.getByText("Mateo is born")).toBeVisible();
    expect(screen.queryByText(/three weeks early/)).toBeNull();
  });

  it("continues on a later day as a strip, not a second opening", () => {
    _render(
      <MilestoneContinues
        strip={{
          milestone: ONE_DAY_BAND.milestone,
          dayPosition: 3,
          dayCount: 5,
        }}
      />,
    );

    expect(screen.getByText(/day 3 of 5/)).toBeVisible();
    expect(screen.getByText("Mateo is born")).toBeVisible();
  });
});

describe("a burst that has not been opened yet", () => {
  // The frames come from the burst's own route, so there is a moment between
  // the press and their arrival. A header over an empty run is not a state.
  it("stays collapsed while it has no frames, even asked to start open", () => {
    _render(
      <Pile>
        <BurstStack
          cover={_item()}
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
          cover={_item()}
          frames={[_item({ itemId: "f1" }), _item({ itemId: "f2" })]}
          frameCount={45}
          span="45 frames"
          seed={0}
          startOpen
        />
      </Pile>,
    );

    expect(screen.getByRole("button", { name: "Collapse" })).toBeVisible();
  });
});

describe("scatterStyle", () => {
  it("is seeded, so the wall is identical on every visit", () => {
    expect(scatterStyle(7)).toEqual(scatterStyle(7));
    expect(scatterStyle(7)).not.toEqual(scatterStyle(8));
  });
});
