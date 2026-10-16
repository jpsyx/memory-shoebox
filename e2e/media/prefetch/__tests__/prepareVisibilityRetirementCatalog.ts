import {
  insertSignedInMember,
  type SignedInMember,
} from "../../../../apps/server/test/helpers/insertSignedInMember.ts";
import type { MediaAcceptanceCatalog } from "../../../support/createMediaAcceptanceCatalog/createMediaAcceptanceCatalog.ts";

/** Seeds a non-owning viewer and a separate uploader before either UI opens. */
export async function prepareVisibilityRetirementCatalog({
  catalog,
  itemId,
}: Readonly<{
  catalog: MediaAcceptanceCatalog;
  itemId: string;
}>): Promise<SignedInMember> {
  const owner = await insertSignedInMember({
    database: catalog.database,
    token: "media-retirement-uploader",
    member: {
      display_name: "Retirement owner",
      email: "retirement-owner@example.com",
      role: "admin",
    },
    session: { expires_at: new Date(Date.now() + 86_400_000).toISOString() },
  });
  await catalog.database
    .updateTable("members")
    .set({ role: "viewer" })
    .where("id", "=", catalog.memberId)
    .execute();
  await catalog.database
    .updateTable("items")
    .set({ uploaded_by: owner.memberId })
    .where("id", "=", itemId)
    .execute();
  return owner;
}
