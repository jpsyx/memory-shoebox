import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  makeItemSummaryFromOverrides,
  makeRemovalRequestFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import { makeHold } from "@/testing/itemWriteTestHelpers";
import { createMeResponse } from "@/testing/createMeResponse";
import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import { renderAt, respondWith, recordedUrls } from "@/testing/surfaceHarness";

const ITEM = makeItemSummaryFromOverrides();
const MEMBER = createMeResponse().me.member;
const OWN = makeRemovalRequestFromOverrides({
  requestedBy: MEMBER,
  reason: "Please remove this.",
});
const HISTORY = `/api/items/${ITEM.itemId}/removal-requests`;
const RESPONSE = {
  item: ITEM,
  nextCursor: null,
  removalRequests: [],
  canRequestRemoval: true,
};
function _render(requests = [OWN], canRequestRemoval = false) {
  respondWith({
    [`GET ${HISTORY}`]: {
      status: 200,
      body: { ...RESPONSE, removalRequests: requests, canRequestRemoval },
    },
  });
  return renderAt(`/items/${ITEM.itemId}/removal`);
}
describe("asking from scoped history", () => {
  it("accepts a blank reason, records the returned request, and never counts an item open", async () => {
    respondWith({
      [`GET ${HISTORY}`]: { status: 200, body: RESPONSE },
      [`POST ${HISTORY}`]: { status: 200, body: OWN },
    });
    renderAt(`/items/${ITEM.itemId}/removal`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Send the request" }),
    );
    expect(
      await screen.findByText(
        "Your request was recorded. Notifications were queued.",
      ),
    ).toBeVisible();
    expect(
      await screen.findByText("Please remove this.", { exact: true }),
    ).toBeVisible();
    expect(recordedUrls()).not.toContain(`/api/items/${ITEM.itemId}`);
  });
  it("gives own open history precedence even when the response says asking is allowed", async () => {
    _render([OWN], true);
    expect(
      await screen.findByText("You have already asked about this one."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Send the request" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Withdraw the request" }),
    ).toBeVisible();
  });
  it("shows actual declined words and opens a fresh form without sending", async () => {
    const reply = "It is the only one with all four of you.\nKeeping it.";
    _render(
      [
        {
          ...OWN,
          state: "declined",
          canWithdraw: false,
          declineReason: reply,
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
      true,
    );
    expect(
      await screen.findByText(reply, {
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
    _render([{ ...OWN, state: "withdrawn", canWithdraw: false }], false);
    expect(await screen.findByText("You withdrew this request.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Ask again" })).toBeNull();
  });
  it("shows every incoming request alongside an admin's own asking form without proxy withdrawal", async () => {
    const incoming = makeRemovalRequestFromOverrides({
      canWithdraw: false,
      canDeleteItem: true,
      canDecline: true,
      reason: "First ask",
    });
    _render(
      [
        incoming,
        {
          ...incoming,
          requestId: "018f0000-0000-7000-8000-00000000a002",
          reason: "Second ask",
        },
      ],
      true,
    );
    expect(await screen.findByText("First ask")).toBeVisible();
    expect(screen.getByText("Second ask")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Delete it" })).toHaveLength(
      2,
    );
    expect(
      screen.getByRole("button", { name: "Send the request" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Withdraw the request" }),
    ).toBeNull();
  });
  it.each(["missing", "malformed", "inaccessible"])(
    "uses unavailable presentation for %s addresses",
    async (address) => {
      const itemId = address === "malformed" ? "abc" : ITEM.itemId;
      respondWith({
        [`GET /api/items/${itemId}/removal-requests`]: {
          status: 404,
          body: { error: "item_not_found", message: "Not here" },
        },
      });
      renderAt(`/items/${itemId}/removal`);
      expect(await screen.findByText("This one is not here.")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /Send|Withdraw|Delete/ }),
      ).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Back to the photo" }),
      ).toBeNull();
    },
  );
  it("preserves failed words and refuses a trimmed 4,001 character reason", async () => {
    respondWith({
      [`GET ${HISTORY}`]: { status: 200, body: RESPONSE },
      [`POST ${HISTORY}`]: {
        status: 400,
        body: { error: "validation_error", message: "Bad reason" },
      },
    });
    renderAt(`/items/${ITEM.itemId}/removal`);
    const input = await screen.findByRole("textbox", {
      name: "Why, if you want to say",
    });
    await userEvent.type(input, "My words");
    await userEvent.click(
      screen.getByRole("button", { name: "Send the request" }),
    );
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(input).toHaveValue("My words");
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste(` ${"x".repeat(4001)} `);
    await userEvent.click(
      screen.getByRole("button", { name: "Send the request" }),
    );
    expect(
      await screen.findByText("Use no more than 4,000 characters."),
    ).toBeVisible();
    expect(
      getRecordedRequests().filter(({ method }) => {
        return method === "POST";
      }),
    ).toHaveLength(1);
  });
  it("withdraws and uses refreshed authority before offering another ask", async () => {
    _render();
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
        if (url === HISTORY && hasWithdrawn)
          return Response.json({
            ...RESPONSE,
            removalRequests: [
              { ...OWN, state: "withdrawn", canWithdraw: false },
            ],
          });
        return originalFetch(url, init);
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
    _render();
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
        if (url.startsWith("/api/removal-requests?") && hasConflicted)
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
        if (url === HISTORY && hasConflicted)
          return Response.json({
            ...RESPONSE,
            removalRequests: [
              {
                ...OWN,
                state: "declined",
                canWithdraw: false,
                declineReason: "Keeping this.",
              },
            ],
          });
        return originalFetch(url, init);
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Withdraw the request" }),
    );
    expect(await screen.findByText("Keeping this.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Withdraw the request" }),
    ).toBeNull();
  });
  it("navigates confirmed deletion to the queue with local confirmation", async () => {
    _render([
      makeRemovalRequestFromOverrides({
        canWithdraw: false,
        canDeleteItem: true,
      }),
    ]);
    const originalFetch = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "DELETE")
          return new Response(null, { status: 204 });
        if (url.startsWith("/api/removal-requests?"))
          return Response.json({
            removalRequests: [],
            nextCursor: null,
            openCount: 0,
            settledCount: 1,
          });
        return originalFetch(url, init);
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete it" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Delete it",
      }),
    );
    expect(
      await screen.findByText("The photograph was deleted."),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Removal requests." }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Back to the photo" }),
    ).toBeNull();
  });
  it("keeps new-item history isolated from a delayed old-item read", async () => {
    const other = makeItemSummaryFromOverrides({
      itemId: "018f0000-0000-7000-8000-00000000f002",
    });
    const { hold, letGo } = makeHold();
    respondWith({
      [`GET ${HISTORY}`]: {
        status: 200,
        body: { ...RESPONSE, removalRequests: [OWN] },
        waitFor: hold,
      },
      [`GET /api/items/${other.itemId}/removal-requests`]: {
        status: 200,
        body: { ...RESPONSE, item: other, canRequestRemoval: false },
      },
    });
    const { router } = renderAt(`/items/${ITEM.itemId}/removal`);
    await waitFor(() => {
      return expect(recordedUrls()).toContain(HISTORY);
    });
    await act(async () => {
      await router.navigate({
        to: "/items/$itemId/removal",
        params: { itemId: other.itemId },
      });
    });
    expect(
      await screen.findByText(
        "You cannot ask for this photograph to come down.",
      ),
    ).toBeVisible();
    await act(async () => {
      return letGo();
    });
    expect(screen.queryByText("Please remove this.")).toBeNull();
  });
  it("does not navigate a new item after delayed deletion of the previous item", async () => {
    const other = makeItemSummaryFromOverrides({
      itemId: "018f0000-0000-7000-8000-00000000f002",
    });
    const { hold, letGo } = makeHold();
    respondWith({
      [`GET ${HISTORY}`]: {
        status: 200,
        body: {
          ...RESPONSE,
          removalRequests: [
            makeRemovalRequestFromOverrides({
              canWithdraw: false,
              canDeleteItem: true,
            }),
          ],
        },
      },
      [`DELETE /api/items/${ITEM.itemId}`]: {
        status: 204,
        body: undefined,
        waitFor: hold,
      },
      [`GET /api/items/${other.itemId}/removal-requests`]: {
        status: 200,
        body: { ...RESPONSE, item: other },
      },
    });
    const { router } = renderAt(`/items/${ITEM.itemId}/removal`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete it" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Delete it",
      }),
    );
    await act(async () => {
      await router.navigate({
        to: "/items/$itemId/removal",
        params: { itemId: other.itemId },
      });
    });
    await act(async () => {
      return letGo();
    });
    expect(
      await screen.findByRole("button", { name: "Send the request" }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(
      `/items/${other.itemId}/removal`,
    );
    expect(screen.queryByText("The photograph was deleted.")).toBeNull();
  });
  it("restores a surviving asking-page destination after declining removes its trigger", async () => {
    const incoming = makeRemovalRequestFromOverrides({
      canWithdraw: false,
      canDecline: true,
    });
    respondWith({
      [`GET ${HISTORY}`]: {
        status: 200,
        body: { ...RESPONSE, removalRequests: [incoming] },
      },
      [`POST /api/removal-requests/${incoming.requestId}/decline`]: {
        status: 200,
        body: {
          ...incoming,
          state: "declined",
          canDecline: false,
          declineReason: "Keeping it for now.",
        },
      },
    });
    renderAt(`/items/${ITEM.itemId}/removal`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Keep it, and say why" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByRole("textbox"),
      "Keeping it for now.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send this and keep it" }),
    );
    expect(await screen.findByText("Keeping it for now.")).toBeVisible();
    await waitFor(() => {
      return expect(
        document.querySelector("[data-removal-page-focus]"),
      ).toHaveFocus();
    });
  });
  it("requires a fresh Ask again after a second request is sent and withdrawn", async () => {
    let current: import("@memory-shoebox/shared").RemovalRequestDto = {
      ...OWN,
      state: "declined",
      canWithdraw: false,
      declineReason: "Keeping it.",
    };
    respondWith({ [`GET ${HISTORY}`]: { status: 200, body: RESPONSE } });
    const originalFetch = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === HISTORY && init?.method === "POST") {
          current = {
            ...OWN,
            requestId: "018f0000-0000-7000-8000-00000000a002",
            state: "open",
            canWithdraw: true,
            declineReason: null,
          };
          return Response.json(current);
        }
        if (url.endsWith("/withdraw") && init?.method === "POST") {
          current = { ...current, state: "withdrawn", canWithdraw: false };
          return Response.json(current);
        }
        if (url === HISTORY)
          return Response.json({
            ...RESPONSE,
            removalRequests: [current],
            canRequestRemoval: current.state !== "open",
          });
        return originalFetch(url, init);
      }),
    );
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
    expect(
      screen.queryByRole("button", { name: "Send the request" }),
    ).toBeNull();
  });
  it("removes stale answer controls when the confirmed own open request loses capabilities", async () => {
    const created = { ...OWN, canDecline: true, canDeleteItem: true };
    const media = {
      ...ITEM.media,
      altText: "Fresh request preview",
      thumb: {
        ...ITEM.media.thumb,
        url: "https://example.invalid/fresh.jpg?signature=new",
      },
    };
    const current = {
      ...created,
      canDecline: false,
      canDeleteItem: false,
      requestedBy: { ...MEMBER, displayName: "Fresh requester" },
      media,
    };
    let hasCreated = false;
    respondWith({ [`GET ${HISTORY}`]: { status: 200, body: RESPONSE } });
    const originalFetch = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === HISTORY && init?.method === "POST") {
          hasCreated = true;
          return Response.json(created);
        }
        if (url === HISTORY && hasCreated)
          return Response.json({
            ...RESPONSE,
            removalRequests: [current],
            canRequestRemoval: false,
          });
        return originalFetch(url, init);
      }),
    );
    renderAt(`/items/${ITEM.itemId}/removal`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Send the request" }),
    );
    expect(
      await screen.findByText(
        "Your request was recorded. Notifications were queued.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete it" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Keep it, and say why" }),
    ).toBeNull();
    expect(
      screen.getByText("Fresh requester is tagged in this one"),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Fresh request preview" }),
    ).toHaveAttribute("src", media.thumb.url);
  });
});
