import { describe, expect, it } from "vitest";
import {
  makeItemSummaryFromOverrides,
  makeRemovalRequestFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import {
  getRemovalViewFromResponse,
  makeRemovalResponseFromConfirmedRequest,
} from "./removalStateHelpers";
const VIEWER = {
  memberId: "own",
  displayName: "Papá",
  role: "admin",
  isAdmin: true,
} as const;
describe("own history grouping", () => {
  it("selects newest own history by creation and gives an older open ask precedence", () => {
    const open = makeRemovalRequestFromOverrides({
      requestedBy: { memberId: "own", displayName: "Old name" },
      createdAt: "2026-09-01T12:00:00Z",
    });
    const declined = {
      ...open,
      requestId: "newer",
      createdAt: "2026-10-01T12:00:00Z",
      state: "declined" as const,
    };
    const incoming = makeRemovalRequestFromOverrides({
      canWithdraw: false,
      requestId: "incoming",
    });
    const view = getRemovalViewFromResponse({
      viewer: VIEWER,
      response: {
        item: makeItemSummaryFromOverrides(),
        nextCursor: null,
        removalRequests: [open, incoming, declined],
        canRequestRemoval: true,
      },
    });
    expect(view.ownNewest).toEqual(declined);
    expect(view.ownOpen).toEqual(open);
    expect(view.incoming).toEqual([incoming]);
    expect(view.canAsk).toBe(false);
  });
  it("does not replace refreshed settled authority with a stale confirmed open result", () => {
    const request = makeRemovalRequestFromOverrides();
    const settled = {
      ...request,
      state: "declined" as const,
      declineReason: "Keeping this.",
    };
    const response = {
      item: makeItemSummaryFromOverrides(),
      nextCursor: null,
      removalRequests: [settled],
      canRequestRemoval: true,
    };
    expect(
      makeRemovalResponseFromConfirmedRequest({ response, request })
        .removalRequests,
    ).toEqual([settled]);
  });
  it("does not render duplicate incoming identities as duplicate cards", () => {
    const incoming = makeRemovalRequestFromOverrides({
      canWithdraw: false,
      requestId: "incoming",
    });
    const response = {
      item: makeItemSummaryFromOverrides(),
      nextCursor: null,
      removalRequests: [incoming, incoming],
      canRequestRemoval: false,
    };
    expect(
      getRemovalViewFromResponse({ response, viewer: VIEWER }).incoming,
    ).toEqual([incoming]);
  });
});
