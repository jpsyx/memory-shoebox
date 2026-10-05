import type { QueryClient } from "@tanstack/react-query";
import type { InviteMemberRequest } from "@memory-shoebox/shared";
import {
  adminMembersQueryOptions,
  inviteMember,
} from "@/api/adminMembers/adminMembers";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { meQueryOptions } from "@/api/me/me";
import {
  getInvitationRequestFromRow,
  hasMatchingInvitation,
  invitationFailure,
  type InvitationRow,
} from "./setupInvitationHelpers";

async function _hasQueuedInvitation(
  body: InviteMemberRequest,
  client: QueryClient,
): Promise<boolean> {
  const directory = await client.fetchQuery(adminMembersQueryOptions);
  return hasMatchingInvitation({
    directory,
    body,
    account: client.getQueryData(meQueryOptions.queryKey),
  });
}
function _queuedRow(
  row: Readonly<InvitationRow>,
  body: InviteMemberRequest,
): InvitationRow {
  return {
    ...row,
    email: body.email,
    isQueued: true,
    error: undefined,
    isUncertain: false,
  };
}
async function _recoverInvitation(
  options: Readonly<{
    error: unknown;
    row: InvitationRow;
    body: InviteMemberRequest;
    client: QueryClient;
  }>,
): Promise<InvitationRow> {
  const { error, row, body, client } = options;
  const isUncertain = !(error instanceof ApiRequestError);
  if (isUncertain) {
    try {
      if (await _hasQueuedInvitation(body, client)) {
        return _queuedRow(row, body);
      }
    } catch {
      /* Keep uncertain drafts for directory recovery before retry. */
    }
  }
  return { ...row, error: invitationFailure(error), isUncertain };
}
/** Queues one draft, checking uncertain replies against the private directory. */
export async function sendSetupInvitation(
  options: Readonly<{ row: InvitationRow; client: QueryClient }>,
): Promise<InvitationRow> {
  const { row, client } = options;
  if (row.isQueued) {
    return row;
  }
  const parsed = getInvitationRequestFromRow(row);
  if (!parsed.success) {
    return { ...row, error: parsed.error.issues[0]?.message };
  }
  if (row.isUncertain) {
    try {
      if (await _hasQueuedInvitation(parsed.data, client)) {
        return _queuedRow(row, parsed.data);
      }
    } catch (error: unknown) {
      return { ...row, error: invitationFailure(error), isUncertain: true };
    }
  }
  try {
    await inviteMember(parsed.data);
    return _queuedRow(row, parsed.data);
  } catch (error: unknown) {
    return _recoverInvitation({ error, row, body: parsed.data, client });
  }
}
