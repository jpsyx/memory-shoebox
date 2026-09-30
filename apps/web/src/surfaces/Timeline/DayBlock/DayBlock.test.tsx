import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { DayBlock } from "@/surfaces/Timeline/DayBlock/DayBlock";
import {
  makeBand,
  makeBurst,
  makeDay,
  makeItem,
} from "@/surfaces/Timeline/timelineFixtures";
import { theme } from "@/theme/theme";

function _render(day: ReturnType<typeof makeDay>, countLabel?: string) {
  return render(
    <MantineProvider theme={theme}>
      <DayBlock
        day={day}
        countLabel={countLabel}
        framesByBurstId={new Map()}
        onOpenBurst={vi.fn()}
      />
    </MantineProvider>,
  );
}

/**
 * The one case that needs a real router.
 *
 * A milestone-only day's empty pile carries a `Link` to `/milestones`, and a
 * bare `Link` throws outside a mounted router (`ProductBar.test.tsx` carries
 * the identical stub for the identical reason). The router resolves its
 * first match asynchronously even against memory history with no loader on
 * any route, which is why the test below awaits the page's own sentence.
 */
function _renderWithRouter(day: ReturnType<typeof makeDay>) {
  const rootRoute = createRootRoute({
    component: () => {
      return <Outlet />;
    },
  });
  const indexRoute = createRoute({
    getParentRoute: () => {
      return rootRoute;
    },
    path: "/",
    component: () => {
      return (
        <DayBlock
          day={day}
          countLabel={undefined}
          framesByBurstId={new Map()}
          onOpenBurst={vi.fn()}
        />
      );
    },
  });
  const milestonesRoute = createRoute({
    getParentRoute: () => {
      return rootRoute;
    },
    path: "/milestones",
    component: () => {
      return null;
    },
  });
  const routeTree = rootRoute.addChildren([indexRoute, milestonesRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <MantineProvider theme={theme}>
      <RouterProvider router={router} />
    </MantineProvider>,
  );
}

describe("DayBlock", () => {
  it("carries the day's own count and its unseen count", () => {
    _render(makeDay({ itemCount: 212, unseenCount: 31 }));
    expect(screen.getByText("212")).toBeTruthy();
    expect(screen.getByText("31 new")).toBeTruthy();
  });

  it("says nothing about unseen when nothing is", () => {
    _render(makeDay({ itemCount: 4, unseenCount: 0 }));
    expect(screen.queryByText(/new$/)).toBeNull();
  });

  // `DaySpine` carries its own quiet marker with the occasion's name, so a
  // day that opens a band prints that name twice: once as the sticky
  // marker, once in the band itself. `48 items` is unique to the band, and
  // is what actually proves the full band, rather than only the marker,
  // rendered here.
  it("opens an occasion with its full band", () => {
    _render(makeDay({ milestoneBand: makeBand() }));
    expect(screen.getAllByText("The first birthday").length).toBeGreaterThan(0);
    expect(screen.getByText("48 items")).toBeTruthy();
  });

  // Same duplication as the full band: the spine's marker and the
  // continuation strip both carry the occasion's name and its position.
  it("carries every other occasion as a quiet strip", () => {
    _render(
      makeDay({
        milestoneStrips: [
          {
            milestone: {
              milestoneId: "018f0000-0000-7000-8000-00000000d002",
              name: "Abuela's visit",
              startsOn: "2026-09-21",
              endsOn: "2026-09-25",
              blurb: null,
            },
            dayPosition: 5,
            dayCount: 5,
          },
        ],
      }),
    );
    expect(screen.getAllByText(/day 5 of 5/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Abuela's visit").length).toBeGreaterThan(0);
  });

  it("stands a milestone-only day up with nothing attached to it", async () => {
    _renderWithRouter(
      makeDay({
        itemCount: 0,
        items: [],
        milestoneBand: makeBand({ itemCount: 0 }),
      }),
    );
    expect(
      await screen.findByText(/Nothing is attached to this one yet/),
    ).toBeTruthy();
  });

  // The day's own itemCount and the burst's frame count are both 45 here
  // (one burst is the whole day), so "45" legitimately appears twice: once
  // on the spine, once on the stack. "frames" is the word unique to the
  // stack.
  it("draws a burst of two or more as one stack", () => {
    _render(
      makeDay({
        itemCount: 45,
        items: [makeItem({ burst: makeBurst() })],
      }),
    );
    expect(screen.getAllByText("45").length).toBeGreaterThan(0);
    expect(screen.getByText("frames")).toBeTruthy();
  });

  it("draws a burst the server sent as null as a plain print", () => {
    const { container } = _render(
      makeDay({ itemCount: 1, items: [makeItem({ burst: null })] }),
    );
    expect(container.querySelectorAll("[data-burst-id]").length).toBe(0);
    expect(container.querySelectorAll("[data-item-id]").length).toBe(1);
  });

  it("takes the spine's unit word from the filter when there is one", () => {
    _render(makeDay({ itemCount: 88 }), "with Elena");
    expect(screen.getByText("with Elena")).toBeTruthy();
  });

  it("anchors the day, so the rail can scroll to it", () => {
    const { container } = _render(makeDay({ capturedOn: "2026-09-27" }));
    expect(container.querySelector("#day-2026-09-27")).toBeTruthy();
  });
});
