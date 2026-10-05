import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { adminMembersQueryOptions, inviteMember } from "@/api/inviteMember";
import { meQueryOptions } from "@/api/me/me";
import type { InviteMemberRequest } from "@memory-shoebox/shared";
import type { QueryClient } from "@tanstack/react-query";
import {
  hasMatchingInvitation,
  invitationFailure,
  makeInvitationRequestValidationFromRow,
  type InvitationRow,
} from "../../../setupInvitationHelpers";

async function _hasQueuedInvitation(
  options: Readonly<{ body: InviteMemberRequest; client: QueryClient }>,
): Promise<boolean> {
  const { body, client } = options;
  const directory = await client.fetchQuery(adminMembersQueryOptions);
  return hasMatchingInvitation({
    directory,
    body,
    account: client.getQueryData(meQueryOptions.queryKey) ?? undefined,
  });
}
function _queuedRow(
  options: Readonly<{ row: InvitationRow; body: InviteMemberRequest }>,
): InvitationRow {
  const { row, body } = options;
  return {
    ...row,
    email: body.email,
    isQueued: true,
    error: undefined,
    errorField: undefined,
    isUncertain: false,
  };
}
type RecoverInvitationOptions = {
  error: unknown;
  row: InvitationRow;
  body: InviteMemberRequest;
  client: QueryClient;
};
async function _recoverInvitation(
  options: Readonly<RecoverInvitationOptions>,
): Promise<InvitationRow> {
  const { error, row, body, client } = options;
  const isUncertain = !(error instanceof ApiRequestError);
  if (isUncertain) {
    try {
      if (await _hasQueuedInvitation({ body, client })) {
        return _queuedRow({ row, body });
      }
    } catch {
      // Keep uncertain drafts for directory recovery before retry.
    }
  }
  return { ...row, error: invitationFailure(error), isUncertain };
}
/**
 * Queues one draft, checking uncertain replies against the private directory.
 */
export async function sendSetupInvitation(
  options: Readonly<{ row: InvitationRow; client: QueryClient }>,
): Promise<InvitationRow> {
  const { row, client } = options;
  if (row.isQueued) {
    return row;
  }
  const parsed = makeInvitationRequestValidationFromRow(row);
  if (!parsed.success) {
    return { ...row, error: parsed.error.issues[0]?.message };
  }
  if (row.isUncertain) {
    try {
      if (await _hasQueuedInvitation({ body: parsed.data, client })) {
        return _queuedRow({ row, body: parsed.data });
      }
    } catch (error: unknown) {
      return { ...row, error: invitationFailure(error), isUncertain: true };
    }
  }
  try {
    await inviteMember(parsed.data);
    return _queuedRow({ row, body: parsed.data });
  } catch (error: unknown) {
    return _recoverInvitation({ error, row, body: parsed.data, client });
  }
}
