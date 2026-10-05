import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAt, respondWith, recordedUrls } from "@/testing/surfaceHarness";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  makeActivityEntryFromOverrides,
  OBSERVATION_MEMBER_ID,
} from "@/surfaces/Presence/__tests__/observationFixtureHelpers";
function _respondWithNewestActivity(): void {
  respondWith({
    "GET /api/activity": {
      status: 200,
      body: {
        activity: [makeActivityEntryFromOverrides()],
        nextCursor: "opaque+/=",
      },
    },
  });
}

describe("Changes", () => {
  it("keeps historical labels and devices after deletion without media lookups", async () => {
    respondWith({
      "GET /api/activity": {
        status: 200,
        body: {
          activity: [
            makeActivityEntryFromOverrides(),
            makeActivityEntryFromOverrides({
              entryId: "018f0000-0000-7000-8000-000000000002",
              deviceLabel: null,
              kind: "group_membership_changed",
              detail: {
                kind: "group_membership_changed",
                addedLabels: ["Inés"],
                removedLabels: ["Rafa"],
              },
            }),
          ],
          nextCursor: null,
        },
      },
    });
    renderAt("/changes");
    expect(await screen.findByText(/deleted The old photograph/)).toBeVisible();
    expect(screen.getAllByText("Former Papá")).toHaveLength(2);
    expect(screen.getByText("Old iPhone")).toBeVisible();
    expect(screen.getByText("Item deleted")).toBeVisible();
    expect(screen.queryByText("item_deleted")).toBeNull();
    expect(screen.getByText("Device not recorded")).toBeVisible();
    expect(screen.getByText(/Added Inés. Removed Rafa/)).toBeVisible();
    expect(
      screen.getByText(/including photographs uploaded before the change/),
    ).toBeVisible();
    expect(
      recordedUrls().some((url) => {
        return url.includes("/items/") || url.includes("/members");
      }),
    ).toBe(false);
    expect(
      screen.queryByRole("link", { name: "The old photograph" }),
    ).toBeNull();
  });
  it("names known settings in plain English while preserving their exact subject filter", async () => {
    respondWith({
      "GET /api/activity": {
        status: 200,
        body: {
          activity: [
            makeActivityEntryFromOverrides({
              kind: "setting_changed",
              family: "authority",
              subject: {
                kind: "setting",
                id: "shoebox.name",
                label: "shoebox.name",
              },
              detail: {
                kind: "setting_changed",
                settingKey: "shoebox.name",
                fromValue: "Old",
                toValue: "New",
              },
            }),
          ],
          nextCursor: null,
        },
      },
    });
    renderAt("/changes?subjectId=shoebox.name");
    expect(
      await screen.findByText(/changed the Shoebox name from Old to New/),
    ).toBeVisible();
    expect(screen.getByText("Setting changed")).toBeVisible();
    expect(screen.queryByText("shoebox.name")).toBeNull();
    expect(recordedUrls()).toContain("/api/activity?subjectId=shoebox.name");
  });
  it("combines URL filters, accepts a historical setting key and clears all filters", async () => {
    respondWith({
      "GET /api/activity": {
        status: 200,
        body: { activity: [], nextCursor: null },
      },
    });
    const { router } = renderAt(
      `/changes?family=authority&actorMemberId=${OBSERVATION_MEMBER_ID}&subjectId=legacy.setting`,
    );
    expect(
      await screen.findByText("No changes match these filters."),
    ).toBeVisible();
    expect(recordedUrls()).toContain(
      `/api/activity?family=authority&actorMemberId=${OBSERVATION_MEMBER_ID}&subjectId=legacy.setting`,
    );
    await userEvent.click(screen.getByRole("link", { name: "Clear filters" }));
    await waitFor(() => {
      return expect(router.state.location.search).toEqual({});
    });
    expect(
      await screen.findByText("Nothing has been changed yet."),
    ).toBeVisible();
  });
  it("appends opaque pages into the same local day and retries a page failure safely", async () => {
    _respondWithNewestActivity();
    renderAt("/changes");
    await screen.findByText(/deleted The old photograph/);
    respondWith({
      "GET /api/activity": {
        status: 503,
        body: { error: "unavailable", message: "No" },
      },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Load older changes" }),
    );
    expect(
      await screen.findByRole("button", { name: "Retry older changes" }),
    ).toBeEnabled();
    expect(screen.getByText(/deleted The old photograph/)).toBeVisible();
    respondWith({
      "GET /api/activity": {
        status: 200,
        body: {
          activity: [
            makeActivityEntryFromOverrides({
              entryId: "018f0000-0000-7000-8000-000000000002",
              occurredAt: "2026-09-16T23:50:00.000Z",
              kind: "signed_out",
            }),
          ],
          nextCursor: null,
        },
      },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Retry older changes" }),
    );
    expect(
      await screen.findByText(/signed out: The old photograph/),
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(recordedUrls()).toContain("/api/activity?cursor=opaque%2B%2F%3D");
  });
  it("shows pending, initial failure and retry distinctly from an empty log", async () => {
    let settle = () => {};
    respondWith({
      "GET /api/activity": {
        status: 503,
        body: { error: "unavailable", message: "No" },
        waitFor: new Promise<void>((complete) => {
          settle = complete;
        }),
      },
    });
    renderAt("/changes");
    expect(await screen.findByText("Loading changes…")).toBeVisible();
    settle();
    await screen.findByRole("button", { name: "Retry" });
    respondWith({
      "GET /api/activity": {
        status: 200,
        body: { activity: [], nextCursor: null },
      },
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("Nothing has been changed yet."),
    ).toBeVisible();
  });
  it.each(["viewer", "uploader"] as const)(
    "refuses %s without reading history",
    async (role) => {
      respondWith({
        "GET /api/me": { status: 200, body: createMeResponse({ role }) },
      });
      renderAt("/changes");
      expect(
        await screen.findByText(/Only an admin can view changes/),
      ).toBeVisible();
      expect(recordedUrls()).not.toContain("/api/activity");
    },
  );
});
