import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  makeDay,
  recordedUrls,
  renderTimeline,
  respondWith,
} from "./timeline.fixtures";

describe("the timeline", () => {
  beforeEach(() => {
    respondWith();
  });

  it("draws the days the route returned", async () => {
    renderTimeline();
    expect(await screen.findByText("27")).toBeTruthy();
  });

  it("shows surface 5 when the archive has no days", async () => {
    respondWith({
      "GET /api/timeline": {
        body: { days: [], nextCursor: null, resultCount: null },
        status: 200,
      },
      "GET /api/timeline/rail": {
        body: { days: [], nextCursor: null },
        status: 200,
      },
    });
    renderTimeline();
    expect(await screen.findByText("Nothing on the door yet.")).toBeTruthy();
  });

  it("shows a viewer the other copy for the same empty payload", async () => {
    respondWith({
      "GET /api/me": {
        body: createMeResponse({ role: "viewer" }),
        status: 200,
      },
      "GET /api/timeline": {
        body: { days: [], nextCursor: null, resultCount: null },
        status: 200,
      },
      "GET /api/timeline/rail": {
        body: { days: [], nextCursor: null },
        status: 200,
      },
    });
    renderTimeline();
    expect(await screen.findByText("Nothing here for you yet.")).toBeTruthy();
  });

  it("draws the end of the archive when there is no next page", async () => {
    renderTimeline();
    expect(await screen.findByText("That is all of it.")).toBeTruthy();
  });

  it("does not draw the end while there is another page to come", async () => {
    respondWith({
      "GET /api/timeline": {
        body: { days: [makeDay()], nextCursor: "next", resultCount: null },
        status: 200,
      },
    });
    renderTimeline();
    await screen.findByText("27");
    expect(screen.queryByText("That is all of it.")).toBeNull();
  });

  it("keeps the strip away when nothing is filtered", async () => {
    renderTimeline();
    await screen.findByText("27");
    expect(
      screen.queryByRole("button", { name: "Clear, show everything" }),
    ).toBeNull();
  });

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
