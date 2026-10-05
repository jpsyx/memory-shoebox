import {
  makeItemSummaryFromOverrides,
  makeRemovalRequestFromOverrides,
} from "@/testing/askingAndOccasionsFixtureHelpers";
import { createMeResponse } from "@/testing/createMeResponse";
import { renderAt, respondWith } from "@/testing/surfaceHarness";
import type {
  ItemSummary,
  ListItemRemovalRequestsResponse,
  RemovalRequestDto,
} from "@memory-shoebox/shared";
/** Shared authoritative fixture for the controller scenarios. */
export const ITEM = makeItemSummaryFromOverrides() satisfies ItemSummary;

/** Shared authoritative fixture for the controller scenarios. */
export const MEMBER = createMeResponse().me.member satisfies ReturnType<
  typeof createMeResponse
>["me"]["member"];

/** Shared authoritative fixture for the controller scenarios. */
export const OWN = makeRemovalRequestFromOverrides({
  requestedBy: MEMBER,
  reason: "Please remove this.",
}) satisfies RemovalRequestDto;

/** Shared authoritative fixture for the controller scenarios. */
export const HISTORY =
  `/api/items/${ITEM.itemId}/removal-requests` satisfies string;

/** Shared authoritative fixture for the controller scenarios. */
export const RESPONSE = {
  item: ITEM,
  nextCursor: null,
  removalRequests: [],
  canRequestRemoval: true,
} satisfies ListItemRemovalRequestsResponse;

/** Installs or renders the shared controller test fixture. */
export function renderRemovalSurface({
  requests = [OWN],
  canRequestRemoval = false,
}: Readonly<{
  requests?: RemovalRequestDto[];
  canRequestRemoval?: boolean;
}>): ReturnType<typeof renderAt> {
  respondWith({
    [`GET ${HISTORY}`]: {
      status: 200,
      body: { ...RESPONSE, removalRequests: requests, canRequestRemoval },
    },
  });
  return renderAt(`/items/${ITEM.itemId}/removal`);
}
