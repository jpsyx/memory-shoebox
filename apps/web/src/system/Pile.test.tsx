import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ItemSummary, MediaRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  Archive,
  DayRow,
  DaySpine,
  Pile,
  PileItems,
  scatterStyle,
  type TimelineDay,
} from "@/system/Pile";
import { cssVariablesResolver, theme } from "@/theme/theme";

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

  it("collapses a burst to one object carrying its visible frame count", () => {
    _render(
      <Pile>
        <PileItems
          items={[
            _item({
              burst: {
                burstId: "b1",
                visibleFrameCount: 45,
                startsAt: "2026-09-14T06:41:00.000Z",
                endsAt: "2026-09-14T06:41:30.000Z",
                coverItemId: "i1",
              },
            }),
          ]}
        />
      </Pile>,
    );

    /* The chip reads "45 frames", the unit in a nested <small>. */
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

describe("scatterStyle", () => {
  it("is seeded, so the wall is identical on every visit", () => {
    expect(scatterStyle(7)).toEqual(scatterStyle(7));
    expect(scatterStyle(7)).not.toEqual(scatterStyle(8));
  });
});
