import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  saveGroupDraft,
  makeGroupSubmissionFromDraft,
  makeGroupFieldErrorsFromFailures,
} from "@/surfaces/Groups/GroupForm/groupDraftHelpers";
import { requireGroupAuthority } from "@/surfaces/Groups/groupAuthority";
import { GROUP } from "@/surfaces/Groups/GroupsSurface/__tests__/GroupsSurface.fixtures";
import { createMeResponse } from "@/testing/createMeResponse";
import { meQueryOptions } from "@/api/me/me";
import { adminGroupsQueryOptions } from "@/api/adminGroups/adminGroups";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

afterEach(() => {
  return vi.unstubAllGlobals();
});
it("checks execution authority again after a committed rename before replacing membership", async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(meQueryOptions.queryKey, createMeResponse());
  queryClient.setQueryData(adminGroupsQueryOptions.queryKey, {
    shape: "admin",
    groups: [GROUP],
    nextCursor: null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      queryClient.setQueryData(
        meQueryOptions.queryKey,
        createMeResponse({ role: "viewer" }),
      );
      return Response.json({ ...GROUP, name: "Family" });
    }),
  );
  const onRenamed = vi.fn();
  await expect(
    saveGroupDraft({
      queryClient,
      group: GROUP,
      name: "Family",
      memberIds: [],
      onRenamed,
    }),
  ).rejects.toMatchObject({ code: "groups_forbidden" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(onRenamed).toHaveBeenCalledWith({ ...GROUP, name: "Family" });
  expect(
    queryClient.getQueryData(adminGroupsQueryOptions.queryKey)?.groups[0]?.name,
  ).toBe("Family");
});
it.each(["viewer", "uploader"] as const)(
  "blocks execution for cached %s even if route authority was formerly admin",
  (role) => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      meQueryOptions.queryKey,
      createMeResponse({ role }),
    );
    expect(() => {
      return requireGroupAuthority(queryClient);
    }).toThrow("Only an admin can manage groups.");
  },
);
it("attaches invalid membership to membership rather than the valid name", () => {
  const submission = makeGroupSubmissionFromDraft({
    name: "Family",
    memberIds: ["not-an-id"],
  });
  expect(submission.body).toBeUndefined();
  expect(submission.errors.name).toBeUndefined();
  expect(submission.errors.memberIds).toBeDefined();
  const serverError = new ApiRequestError({
    status: 400,
    code: "invalid_request",
    message: "Invalid fields",
    details: { fieldErrors: { memberIds: ["Member unavailable"] } },
  });
  expect(
    makeGroupFieldErrorsFromFailures({ errors: {}, error: serverError }),
  ).toEqual({ name: undefined, memberIds: "Member unavailable" });
});
