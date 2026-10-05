import type {
  ItemSummary,
  MemberRef,
  RemovalRequestDto,
} from "@memory-shoebox/shared";

import { makeRemovalRequestFromOverrides } from "../../../../apps/web/src/testing/askingAndOccasionsFixtureHelpers.ts";

type Options = {
  surface: string;
  state: string;
  member: MemberRef;
  item: ItemSummary;
  longText?: boolean;
};

type MakeSettledOptions = {
  request: ReturnType<typeof makeRemovalRequestFromOverrides>;
  item: ItemSummary;
  asker: MemberRef;
  longText?: boolean;
};

function _makeSettled({
  request,
  item,
  asker,
  longText,
}: Readonly<MakeSettledOptions>): RemovalRequestDto[] {
  const reply = longText
    ? "É".repeat(4000)
    : "It is the only one with all four of you in it. Keeping it, but it is off the front of the day now.";
  const settled: RemovalRequestDto[] = [
    {
      ...request,
      state: "deleted",
      itemId: null,
      media: null,
      canWithdraw: false,
      canDecline: false,
      canDeleteItem: false,
      resolvedBy: item.uploadedBy,
      resolvedAt: "2026-09-25T12:00:00.000Z",
    },
    {
      ...request,
      requestId: "018f0000-0000-7000-8000-00000000a002",
      state: "declined",
      declineReason: reply,
      canWithdraw: false,
      canDecline: false,
      canDeleteItem: false,
      resolvedBy: item.uploadedBy,
      resolvedAt: "2026-09-25T12:00:00.000Z",
    },
    {
      ...request,
      requestId: "018f0000-0000-7000-8000-00000000a003",
      state: "withdrawn",
      canWithdraw: false,
      canDecline: false,
      canDeleteItem: false,
      resolvedBy: asker,
      resolvedAt: "2026-09-25T12:00:00.000Z",
    },
  ];
  return settled;
}

/** Controlled request and its three frozen outcomes. */
export function makeVisualRemovalFromOptions({
  surface,
  state,
  member,
  item,
  longText,
}: Readonly<Options>): {
  request: RemovalRequestDto;
  settled: RemovalRequestDto[];
} {
  const ASKER = {
    memberId: "018f0000-0000-7000-8000-00000000c002",
    displayName: "Prima Inés",
  };
  const request = makeRemovalRequestFromOverrides({
    uploadedBy: item.uploadedBy,
    itemId: item.itemId,
    media: item.media,
    requestedBy: state === "already" || state === "declined" ? member : ASKER,
    reason: "I am mid-sentence and it is not a good one. Sorry to be a bother.",
    canWithdraw: state === "already",
    canDecline:
      state === "uploader" ||
      state === "admin" ||
      surface === "removal-requests",
    canDeleteItem:
      state === "uploader" ||
      state === "admin" ||
      surface === "removal-requests",
  });
  return {
    request,
    settled: _makeSettled({ request, item, asker: ASKER, longText }),
  };
}
