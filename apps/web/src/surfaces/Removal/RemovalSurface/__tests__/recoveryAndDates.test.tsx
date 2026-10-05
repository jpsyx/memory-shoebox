import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  makeItemSummaryFromOverrides,
  makeRemovalRequestFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import { createMeResponse } from "@/testing/createMeResponse";
import { renderAt, respondWith, recordedUrls } from "@/testing/surfaceHarness";

const account = createMeResponse({ role: "viewer" });
const item = makeItemSummaryFromOverrides({
  capturedAt: "2026-10-05T02:30:00.000Z",
  capturedOn: "2026-10-04",
});
const request = makeRemovalRequestFromOverrides({
  requestedBy: account.me.member,
});
const historyPath = `/api/items/${item.itemId}/removal-requests`;

describe("unavailable withdrawal recovery", () => {
  it.each([403, 404])(
    "keeps uncertainty and an idle read-only retry after lost response and %s",
    async (status) => {
      respondWith({
        "GET /api/me": { status: 200, body: account },
        [`GET ${historyPath}`]: {
          status: 200,
          body: {
            item,
            removalRequests: [request],
            canRequestRemoval: false,
            nextCursor: null,
          },
        },
      });
      const original = fetch;
      let writes = 0;
      let failedReads = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (init?.method === "POST") {
            writes += 1;
            throw new TypeError("lost answer");
          }
          if (url === historyPath && writes > 0) {
            failedReads += 1;
            return new Response(
              JSON.stringify({ error: "not_found", message: "Unavailable" }),
              { status },
            );
          }
          return original(url, init);
        }),
      );
      renderAt(`/items/${item.itemId}/removal`);
      await userEvent.click(
        await screen.findByRole("button", { name: "Withdraw the request" }),
      );
      expect(await screen.findByText(/Its answer is uncertain/)).toBeVisible();
      expect(screen.queryByText("Updating your request…")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Withdraw the request" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Send the request" }),
      ).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Back to the photo" }),
      ).toBeNull();
      expect(screen.queryByRole("img")).toBeNull();
      const readsBeforeRetry = failedReads;
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => {
        expect(failedReads).toBeGreaterThan(readsBeforeRetry);
      });
      expect(screen.getByText(/Its answer is uncertain/)).toBeVisible();
      expect(writes).toBe(1);
      expect(screen.queryByText("The photograph was deleted.")).toBeNull();
      expect(recordedUrls()).not.toContain(`/api/items/${item.itemId}`);
    },
  );
});

it("uses the same Shoebox day for preview, request, capture and settlement across midnight UTC", async () => {
  const settled = {
    ...request,
    state: "declined",
    canWithdraw: false,
    createdAt: item.capturedAt,
    itemCapturedAt: item.capturedAt,
    resolvedAt: "2026-10-06T02:30:00.000Z",
    resolvedBy: item.uploadedBy,
    declineReason: "Keeping this one.",
  };
  respondWith({
    "GET /api/me": {
      status: 200,
      body: {
        ...account,
        settings: { ...account.settings, timezone: "America/New_York" },
      },
    },
    [`GET ${historyPath}`]: {
      status: 200,
      body: {
        item,
        removalRequests: [settled],
        canRequestRemoval: false,
        nextCursor: null,
      },
    },
  });
  renderAt(`/items/${item.itemId}/removal`);
  const card = await screen.findByRole("region", {
    name: `Request from ${account.me.member.displayName}`,
  });
  expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent(
    "4 October 2026",
  );
  expect(within(card).getByText(/Put up by/)).toHaveTextContent(
    "4 October 2026",
  );
  expect(within(card).getByText(/Answered by/)).toHaveTextContent(
    "5 October 2026",
  );
  expect(screen.getByText(/Uploaded by/)).toHaveTextContent("4 October 2026");
});
