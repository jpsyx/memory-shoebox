import type { Page, Route } from "@playwright/test";
import { expect } from "../../media.fixtures.ts";

/** Live counters and evidence owned by one retained-stream scenario. */
export type TimelineWindowInstrumentation = {
  requests: number;
  inFlight: number;
  pageByDay: Map<string, number>;
  days: Map<string, number>;
  evictionDeltas: number[];
  diagnostics: unknown[];
};

type PublicationAnchor = {
  reading: { id: string; top: number; row: unknown } | undefined;
  id: string;
  top: number;
  y: number;
  intent: number;
};

type PublicationFrame = {
  readingTop: number | undefined;
  readingRow: unknown;
  targetRow: unknown;
  frame: number;
  top: number | undefined;
  y: number;
  intent: number;
  days: string[];
};

/** Inputs used to append one publication's frame evidence to its owner. */
type RecordPublicationOptions = {
  page: Page;
  state: TimelineWindowInstrumentation;
  anchor: PublicationAnchor;
  lastDay: string;
  samples: Promise<PublicationFrame[]> | undefined;
};

function _getPublicationAnchorFromPage(
  page: Page,
): Promise<PublicationAnchor | undefined> {
  return page.locator("[data-item-id]").evaluateAll((nodes) => {
    (
      window as typeof window & { timelinePublishing: boolean }
    ).timelinePublishing = true;
    const node = nodes.find((value) => {
      const rect = value.getBoundingClientRect();
      return rect.top >= 80 && rect.top < innerHeight;
    });
    const readingNode = nodes.find((candidate) => {
      return (
        candidate.getBoundingClientRect().bottom > 80 &&
        candidate.getBoundingClientRect().top < innerHeight
      );
    });
    const reading = readingNode
      ? {
          id: readingNode.getAttribute("data-item-id")!,
          top: readingNode.getBoundingClientRect().top,
          row: readingNode
            .closest("[data-timeline-row]")
            ?.getBoundingClientRect()
            .toJSON(),
        }
      : undefined;
    return node
      ? {
          reading,
          id: node.getAttribute("data-item-id")!,
          top: node.getBoundingClientRect().top,
          y: scrollY,
          intent: (window as typeof window & { scrollIntent: number })
            .scrollIntent,
        }
      : undefined;
  });
}

function _samplePublicationFrames({
  page,
  anchor,
}: Readonly<{ page: Page; anchor: PublicationAnchor }>): Promise<
  PublicationFrame[]
> {
  return page.evaluate(async ({ id, reading }) => {
    const result = [];
    for (let frame = 0; frame < 12; frame++) {
      await new Promise<void>((done) => {
        return requestAnimationFrame(() => {
          return done();
        });
      });
      const node = document.querySelector(`[data-item-id="${id}"]`);
      const readingNode = document.querySelector(
        `[data-item-id="${reading?.id}"]`,
      );
      result.push({
        readingTop: readingNode?.getBoundingClientRect().top,
        readingRow: readingNode
          ?.closest("[data-timeline-row]")
          ?.getBoundingClientRect()
          .toJSON(),
        targetRow: node
          ?.closest("[data-timeline-row]")
          ?.getBoundingClientRect()
          .toJSON(),
        frame,
        top: node?.getBoundingClientRect().top,
        y: scrollY,
        intent: (window as typeof window & { scrollIntent: number })
          .scrollIntent,
        days: [...document.querySelectorAll('[id^="day-"]')].map((day) => {
          return day.id;
        }),
      });
    }
    return result;
  }, anchor);
}

async function _waitForPublicationTop({
  page,
  anchor,
  lastDay,
}: Readonly<{
  page: Page;
  anchor: PublicationAnchor;
  lastDay: string;
}>): Promise<number | undefined> {
  await page.locator(`[id="day-${lastDay}"]`).waitFor({ state: "attached" });
  await page.evaluate(async () => {
    for (let frame = 0; frame < 6; frame++) {
      await new Promise<void>((done) => {
        return requestAnimationFrame(() => {
          return done();
        });
      });
    }
  });
  return page.locator(`[data-item-id="${anchor.id}"]`).evaluateAll((nodes) => {
    return nodes[0]?.getBoundingClientRect().top;
  });
}

function _appendPublicationDeltas({
  state,
  anchor,
  frameSamples,
}: Readonly<{
  state: TimelineWindowInstrumentation;
  anchor: PublicationAnchor;
  frameSamples: readonly PublicationFrame[] | undefined;
}>): void {
  frameSamples?.forEach((frame) => {
    return state.evictionDeltas.push(
      frame.top === undefined ? Infinity : Math.abs(frame.top - anchor.top),
    );
  });
  frameSamples?.forEach((sample) => {
    if (anchor.reading) {
      state.evictionDeltas.push(
        sample.readingTop === undefined
          ? Infinity
          : Math.abs(sample.readingTop - anchor.reading.top),
      );
    }
  });
}

async function _recordPublication({
  page,
  state,
  anchor,
  lastDay,
  samples,
}: Readonly<RecordPublicationOptions>): Promise<void> {
  const top = await _waitForPublicationTop({ page, anchor, lastDay });
  const frameSamples = await samples;
  expect(
    frameSamples?.every((frame) => {
      return frame.intent === anchor.intent;
    }),
    "no intentional scroll overlaps publication",
  ).toBe(true);
  state.diagnostics.push({
    request: state.requests,
    anchor,
    top,
    frames: frameSamples,
    y: await page.evaluate(() => {
      return scrollY;
    }),
  });
  _appendPublicationDeltas({ state, anchor, frameSamples });
  expect(
    top,
    "reading tile survives the retained-page replacement",
  ).toBeDefined();
  state.evictionDeltas.push(Math.abs(top! - anchor.top));
}

async function _publishTimelinePage({
  page,
  route,
  state,
}: Readonly<{
  page: Page;
  route: Route;
  state: TimelineWindowInstrumentation;
}>): Promise<void> {
  state.inFlight += 1;
  const response = await route.fetch();
  const body = (await response.json()) as {
    days: Array<{ capturedOn: string; itemCount: number }>;
  };
  body.days.forEach((day) => {
    return state.days.set(day.capturedOn, day.itemCount);
  });
  state.requests += 1;
  body.days.forEach((day) => {
    return state.pageByDay.set(day.capturedOn, state.requests);
  });
  const anchor =
    state.requests >= 5 ? await _getPublicationAnchorFromPage(page) : undefined;
  // Start the animation-frame sampler before publishing the fetched response.
  const samples = anchor
    ? _samplePublicationFrames({ page, anchor })
    : undefined;
  await route.fulfill({ response });
  if (anchor) {
    await _recordPublication({
      page,
      state,
      anchor,
      lastDay: body.days.at(-1)!.capturedOn,
      samples,
    });
  }
  await page.evaluate(() => {
    (
      window as typeof window & { timelinePublishing: boolean }
    ).timelinePublishing = false;
  });
  state.inFlight -= 1;
}

/**
 * Records replacement-frame offsets while keeping intentional scrolling paused.
 */
export async function installTimelineWindowInstrumentation(
  page: Readonly<Page>,
): Promise<TimelineWindowInstrumentation> {
  const state: TimelineWindowInstrumentation = {
    requests: 0,
    inFlight: 0,
    pageByDay: new Map(),
    days: new Map(),
    evictionDeltas: [],
    diagnostics: [],
  };
  await page.route(
    (url) => {
      return url.pathname === "/api/timeline";
    },
    async (route) => {
      await _publishTimelinePage({ page, route, state });
    },
  );
  page.on("response", async (response) => {
    if (
      new URL(response.url()).pathname !== "/api/timeline" ||
      !response.ok()
    ) {
      return;
    }
    const body = (await response.json()) as {
      days: Array<{ capturedOn: string; itemCount: number }>;
    };
    body.days.forEach((day) => {
      return state.days.set(day.capturedOn, day.itemCount);
    });
  });
  return state;
}
