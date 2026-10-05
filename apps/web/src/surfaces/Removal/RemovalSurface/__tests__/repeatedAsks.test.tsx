import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import { renderAt, respondWith } from "@/testing/surfaceHarness";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  HISTORY,
  ITEM,
  OWN,
  RESPONSE,
  renderRemovalSurface,
} from "./renderRemovalSurface";
function _installRequiresAFreshAskAgainAfterAAnswers0(): {
  current: RemovalRequestDto;
} {
  const responseState: { current: RemovalRequestDto } = {
    current: {
      ...OWN,
      state: "declined",
      canWithdraw: false,
      declineReason: "Keeping it.",
    },
  };

  respondWith({ [`GET ${HISTORY}`]: { status: 200, body: RESPONSE } });
  return responseState;
}

function _installRefreshesConflictHistoryAndRemovesSettledWithdrawalFetch0(): void {
  const originalFetch = fetch;
  let hasConflicted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        hasConflicted = true;
        return Response.json(
          { error: "request_not_open", message: "Closed" },
          { status: 409 },
        );
      }
      if (url.startsWith("/api/removal-requests?") && hasConflicted) {
        return Response.json({
          removalRequests: [
            {
              ...OWN,
              state: "declined",
              canWithdraw: false,
              declineReason: "Keeping this.",
            },
          ],
          nextCursor: null,
          openCount: 0,
          settledCount: 1,
        });
      }
      return url === HISTORY && hasConflicted
        ? Response.json({
            ...RESPONSE,
            removalRequests: [
              {
                ...OWN,
                state: "declined",
                canWithdraw: false,
                declineReason: "Keeping this.",
              },
            ],
          })
        : originalFetch(url, init);
    }),
  );
}

it("shows actual declined words and opens a fresh form without sending", async () => {
  const REPLY = "It is the only one with all four of you.\nKeeping it.";
  renderRemovalSurface({
    requests: [
      {
        ...OWN,
        state: "declined",
        canWithdraw: false,
        declineReason: REPLY,
        resolvedBy: ITEM.uploadedBy,
      },
      {
        ...OWN,
        requestId: "018f0000-0000-7000-8000-00000000a000",
        state: "withdrawn",
        createdAt: "2026-10-01T12:00:00.000Z",
        canWithdraw: false,
      },
    ],
    canRequestRemoval: true,
  });
  expect(
    await screen.findByText(REPLY, {
      exact: true,
      normalizer: (text) => {
        return text;
      },
    }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Ask again" }));
  expect(
    screen.getByRole("textbox", { name: "Why, if you want to say" }),
  ).toHaveValue("");
  expect(
    getRecordedRequests().filter(({ method }) => {
      return method === "POST";
    }),
  ).toHaveLength(0);
});
it("shows withdrawn outcome and hides Ask again without refreshed capability", async () => {
  renderRemovalSurface({
    requests: [{ ...OWN, state: "withdrawn", canWithdraw: false }],
    canRequestRemoval: false,
  });
  expect(await screen.findByText("You withdrew this request.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Ask again" })).toBeNull();
});
it("withdraws and uses refreshed authority before offering another ask", async () => {
  renderRemovalSurface({});
  const originalFetch = fetch;
  let hasWithdrawn = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        hasWithdrawn = true;
        return Response.json({
          ...OWN,
          state: "withdrawn",
          canWithdraw: false,
        });
      }
      return url === HISTORY && hasWithdrawn
        ? Response.json({
            ...RESPONSE,
            removalRequests: [
              { ...OWN, state: "withdrawn", canWithdraw: false },
            ],
          })
        : originalFetch(url, init);
    }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Withdraw the request" }),
  );
  expect(await screen.findByText("You withdrew this request.")).toBeVisible();
  expect(
    await screen.findByRole("button", { name: "Ask again" }),
  ).toBeVisible();
});
it("refreshes conflict history and removes settled withdrawal controls", async () => {
  renderRemovalSurface({});
  _installRefreshesConflictHistoryAndRemovesSettledWithdrawalFetch0();
  await userEvent.click(
    await screen.findByRole("button", { name: "Withdraw the request" }),
  );
  expect(await screen.findByText("Keeping this.")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Withdraw the request" }),
  ).toBeNull();
});
function _installRepeatedAskHistory(): void {
  const responses0 = _installRequiresAFreshAskAgainAfterAAnswers0();
  const originalFetch = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === HISTORY && init?.method === "POST") {
        responses0.current = {
          ...OWN,
          requestId: "018f0000-0000-7000-8000-00000000a002",
          state: "open",
          canWithdraw: true,
          declineReason: null,
        };
        return Response.json(responses0.current);
      }
      if (url.endsWith("/withdraw") && init?.method === "POST") {
        responses0.current = {
          ...responses0.current,
          state: "withdrawn",
          canWithdraw: false,
        };
        return Response.json(responses0.current);
      }
      return url === HISTORY
        ? Response.json({
            ...RESPONSE,
            removalRequests: [responses0.current],
            canRequestRemoval: responses0.current.state !== "open",
          })
        : originalFetch(url, init);
    }),
  );
}
it("requires a fresh Ask again after a second request is sent and withdrawn", async () => {
  _installRepeatedAskHistory();
  renderAt(`/items/${ITEM.itemId}/removal`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Ask again" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Send the request" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Withdraw the request" }),
  );
  expect(await screen.findByText("You withdrew this request.")).toBeVisible();
  expect(
    await screen.findByRole("button", { name: "Ask again" }),
  ).toBeVisible();
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("renders returned withdrawal even when refreshed ask authority stays false", async () => {
  respondWith({
    [`GET ${HISTORY}`]: {
      status: 200,
      body: { ...RESPONSE, removalRequests: [OWN], canRequestRemoval: false },
    },
    [`POST /api/removal-requests/${OWN.requestId}/withdraw`]: {
      status: 200,
      body: { ...OWN, state: "withdrawn", canWithdraw: false },
    },
  });
  renderAt(`/items/${ITEM.itemId}/removal`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Withdraw the request" }),
  );
  expect(await screen.findByText("You withdrew this request.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Ask again" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Send the request" })).toBeNull();
});
