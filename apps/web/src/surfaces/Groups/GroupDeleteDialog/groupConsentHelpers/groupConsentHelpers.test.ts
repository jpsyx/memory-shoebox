import { expect, it } from "vitest";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  isGroupConsentError,
  getGroupUsageFromConsentError,
  isGroupDeletionAllowed,
} from "@/surfaces/Groups/GroupDeleteDialog/groupConsentHelpers/groupConsentHelpers";
import {
  USAGE,
  GROUP,
} from "@/surfaces/Groups/GroupsSurface/__tests__/renderGroups";

it("rejects malformed or unrelated consent snapshots", () => {
  const error = new ApiRequestError({
    status: 409,
    code: "groups_usage_changed",
    message: "Changed",
    details: { confirmationToken: "changed" },
  });
  expect(isGroupConsentError(error)).toBe(true);
  expect(
    getGroupUsageFromConsentError({ error, groupId: GROUP.groupId }),
  ).toBeUndefined();
  const unrelated = new ApiRequestError({
    status: 409,
    code: "groups_confirmation_required",
    message: "Changed",
    details: {
      ...USAGE,
      group: { ...GROUP, groupId: "018f0000-0000-7000-8000-000000000098" },
    },
  });
  expect(
    getGroupUsageFromConsentError({ error: unrelated, groupId: GROUP.groupId }),
  ).toBeUndefined();
});
it("blocks deletion when consent is absent or invalid", () => {
  const checks = {
    read: { isError: false, isFetching: false },
    mutation: { isPending: false },
  };
  expect(isGroupDeletionAllowed({ ...checks, usage: undefined })).toBe(false);
  expect(
    isGroupDeletionAllowed({
      ...checks,
      usage: { ...USAGE, confirmationToken: null },
    }),
  ).toBe(false);
  expect(
    isGroupDeletionAllowed({
      ...checks,
      usage: {
        ...USAGE,
        narrowingItemCount: 0,
        wideningItemCount: 0,
        confirmationToken: null,
      },
    }),
  ).toBe(false);
});
