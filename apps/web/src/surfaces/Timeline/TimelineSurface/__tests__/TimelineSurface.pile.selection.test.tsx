import { screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { describe, expect, it } from "vitest";

import {
  recordedUrls,
  renderTimeline,
  respondWith,
} from "./TimelineSurface.fixtures";
import {
  HOSPITAL_FACETS,
  installTimelineSurfacePileTestLifecycle,
  TAG_HOSPITAL_ID,
} from "./TimelineSurfacepileTestHelpers";
installTimelineSurfacePileTestLifecycle();
describe("the timeline", () => {
  it.each([
    ["2026-09-30", "2026-09-10"],
    ["2026-09-05", "2026-09-05"],
  ])(
    "preserves the effective jump boundary when opening a print with until %s",
    async (until, expectedUntil) => {
      const { router } = renderTimeline(`/?at=2026-09-10&until=${until}`);
      await userEvent.click(
        await screen.findByRole("button", {
          name: "A cartoon baby, 27 September 2026.",
        }),
      );
      await waitFor(() => {
        expect(router.state.location.state.itemNavigationSelection).toEqual({
          tags: [],
          people: [],
          until: expectedUntil,
        });
      });
    },
  );
});
describe("the timeline", () => {
  it("keeps the strip away when nothing is filtered", async () => {
    renderTimeline();
    await screen.findByText("27");
    expect(
      screen.queryByRole("button", { name: "Clear, show everything" }),
    ).toBeNull();
  });
});
describe("the timeline", () => {
  it("carries the selection to every route it asks", async () => {
    renderTimeline("/?tag=t1&person=p1");
    await waitFor(() => {
      expect(
        recordedUrls().some((url) => {
          return url.startsWith("/api/timeline?");
        }),
      ).toBe(true);
    });
    for (const prefix of [
      "/api/timeline?",
      "/api/timeline/rail?",
      "/api/filters/facets?",
    ]) {
      const asked =
        recordedUrls().find((url) => {
          return url.startsWith(prefix);
        }) ?? "";
      expect(asked).toContain("tags=t1");
      expect(asked).toContain("people=p1");
    }
  });
});
describe("the timeline", () => {
  it("sends a jump as `until` and shows no chip for it", async () => {
    renderTimeline("/?at=2026-09-10");
    await waitFor(() => {
      const asked =
        recordedUrls().find((url) => {
          return url.startsWith("/api/timeline?");
        }) ?? "";
      expect(asked).toContain("until=2026-09-10");
    });
    expect(
      screen.queryByRole("button", { name: "Clear, show everything" }),
    ).toBeNull();
  });
});
describe("the timeline", () => {
  it("keeps the rail complete, unfiltered by the jump", async () => {
    renderTimeline("/?at=2026-09-10");
    await waitFor(() => {
      expect(
        recordedUrls().some((url) => {
          return url.startsWith("/api/timeline/rail");
        }),
      ).toBe(true);
    });
    const rail =
      recordedUrls().find((url) => {
        return url.startsWith("/api/timeline/rail");
      }) ?? "";
    expect(rail).not.toContain("until");
  });
});
describe("the timeline", () => {
  it("keeps the jump when the strip is cleared, because it is not a filter", async () => {
    // The harness renders on a memory history, so the URL a navigation lands
    // on is `router.state.location` and never `window.location`.
    respondWith({
      "GET /api/filters/facets": { body: HOSPITAL_FACETS, status: 200 },
    });
    const { router } = renderTimeline(`/?tag=${TAG_HOSPITAL_ID}&at=2026-09-10`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Clear, show everything" }),
    );
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ at: "2026-09-10" });
    });
  });
});
describe("the timeline", () => {
  it("keeps it too when the dead end's own clear-all is pressed", async () => {
    respondWith({
      "GET /api/timeline": {
        body: {
          previousCursor: null,
          days: [],
          nextCursor: null,
          resultCount: 0,
        },
        status: 200,
      },
      "GET /api/filters/facets": { body: HOSPITAL_FACETS, status: 200 },
    });
    const { router } = renderTimeline(`/?tag=${TAG_HOSPITAL_ID}&at=2026-09-10`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Clear them all" }),
    );
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ at: "2026-09-10" });
    });
  });
});
describe("the timeline", () => {
  it("drops the jump when the selection itself changes", async () => {
    respondWith({
      "GET /api/filters/facets": { body: HOSPITAL_FACETS, status: 200 },
    });
    const { router } = renderTimeline(`/?tag=${TAG_HOSPITAL_ID}&at=2026-09-10`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Stop filtering by hospital" }),
    );
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });
});
describe("the timeline", () => {
  it("drops that sentence the moment something is chosen", async () => {
    renderTimeline("/?find=true&tag=t1");
    await screen.findByText("27");
    expect(screen.queryByText(/Nothing chosen yet/)).toBeNull();
  });
});
describe("the timeline", () => {
  it("says the dates as one span rather than twice over", async () => {
    renderTimeline("/?from=2026-09-01&until=2026-09-30");
    expect(await screen.findByText("1 to 30 September 2026")).toBeTruthy();
  });
});
describe("the timeline", () => {
  it("leaves the jump control out when no day matches", async () => {
    respondWith({
      "GET /api/timeline": {
        body: {
          previousCursor: null,
          days: [],
          nextCursor: null,
          resultCount: 0,
        },
        status: 200,
      },
      "GET /api/timeline/rail": {
        body: { days: [], nextCursor: null },
        status: 200,
      },
    });
    renderTimeline("/?tag=t1");
    expect(await screen.findByText(/Nothing matches/)).toBeTruthy();
    expect(screen.queryByLabelText("Jump to")).toBeNull();
  });
});
