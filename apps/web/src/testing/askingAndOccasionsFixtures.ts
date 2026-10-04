import type {
  ItemSummary,
  MilestoneDetail,
  RemovalRequestDto,
} from "@memory-shoebox/shared";

/** A drawable item with fixed identities and signed-media wire shapes. */
export function makeItemSummaryFromOverrides(
  overrides: Readonly<Partial<ItemSummary>> = {},
): ItemSummary {
  const source = {
    url: "https://example.invalid/photo.jpg?signature=fixture",
    expiresAt: "2026-10-04T13:00:00.000Z",
    width: 1200,
    height: 800,
  };
  return {
    itemId: "018f0000-0000-7000-8000-00000000f001",
    kind: "photo",
    capturedAt: "2026-09-14T04:41:00.000Z",
    capturedOn: "2026-09-14",
    media: {
      thumb: { ...source },
      display: { ...source },
      poster: null,
      video: null,
      durationMs: null,
      altText: "Family at home",
    },
    isUnseen: false,
    uploadedBy: {
      memberId: "018f0000-0000-7000-8000-00000000c001",
      displayName: "Mamá",
    },
    visibility: {
      visibilityRuleId: "visibility-rule-everyone",
      mode: "everyone",
      label: null,
      subjects: [],
    },
    burst: null,
    ...overrides,
  };
}

/** An editable occasion with a deterministic span and nullable metadata. */
export function makeMilestoneDetailFromOverrides(
  overrides: Readonly<Partial<MilestoneDetail>> = {},
): MilestoneDetail {
  return {
    milestone: {
      milestoneId: "018f0000-0000-7000-8000-000000008001",
      name: "Home",
      startsOn: "2026-09-14",
      endsOn: "2026-09-15",
      blurb: null,
    },
    itemCount: 1,
    dayCount: 2,
    canEdit: true,
    canDelete: true,
    mismatchCount: 0,
    createdBy: null,
    createdAt: "2026-10-04T12:00:00.000Z",
    updatedAt: "2026-10-04T12:00:00.000Z",
    ...overrides,
  };
}

/** An open removal ask whose media can be replaced with null in history. */
export function makeRemovalRequestFromOverrides(
  overrides: Readonly<Partial<RemovalRequestDto>> = {},
): RemovalRequestDto {
  const item = makeItemSummaryFromOverrides();
  return {
    requestId: "018f0000-0000-7000-8000-00000000a001",
    state: "open",
    itemId: item.itemId,
    requestedBy: {
      memberId: "018f0000-0000-7000-8000-00000000c002",
      displayName: "Papá",
    },
    reason: null,
    declineReason: null,
    createdAt: "2026-10-04T12:00:00.000Z",
    resolvedAt: null,
    resolvedBy: null,
    uploadedBy: item.uploadedBy,
    itemCapturedAt: item.capturedAt,
    media: item.media,
    canWithdraw: true,
    canDecline: false,
    canDeleteItem: false,
    ...overrides,
  };
}
