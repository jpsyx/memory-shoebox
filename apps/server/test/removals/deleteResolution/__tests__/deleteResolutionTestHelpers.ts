import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertRemovalRequest,
  insertInstanceSetting,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
/** Creates a deletion test app with its uploader, admin actor, and item. */
export async function createDeletionContext(): Promise<DeletionContext> {
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const uploaderId = await insertMember(context.database, {
    display_name: "Uploader",
  });
  const actor = await insertSignedInMember({
    database: context.database,
    member: { role: "admin", display_name: "Actor" },
  });
  const itemId = await insertItem(context.database, { uploadedBy: uploaderId });
  await insertInstanceSetting(context.database, {
    key: "public.base_url",
    value: "https://family.example",
  });
  return { ...context, uploaderId, actor, itemId };
}

/** The deletion app and the members and item used by its request fixtures. */
export type DeletionContext = TestApp & {
  uploaderId: string;
  itemId: string;
  actor: Awaited<ReturnType<typeof insertSignedInMember>>;
};

/** Inserts an open removal request for the item and returns its ID. */
export async function requestRemoval(
  options: Readonly<{
    context: Readonly<DeletionContext>;
    requesterId: string;
  }>,
): Promise<string> {
  const { context, requesterId } = options;
  return insertRemovalRequest(context.database, {
    requestedByMemberId: requesterId,
    itemUploaderMemberId: context.uploaderId,
    item_id: context.itemId,
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  });
}
