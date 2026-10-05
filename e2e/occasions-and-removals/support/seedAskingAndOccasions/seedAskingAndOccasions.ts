import { createDatabase } from "../../../../apps/server/src/db/client.ts";
import { seedMemberAtAddress } from "../../../support/database.ts";
import { ADMIN_EMAIL } from "../../../support/signedIn.ts";
import { E2E_DATABASE_PATH } from "../../../support/e2eEnvironment.constants.ts";
import {
  ASKER_EMAIL,
  UPLOADER_EMAIL,
} from "../../asking-occasions.constants.ts";
import { seedPeopleFromMembers } from "./seedPeopleFromMembers.ts";

import { seedVisibleCase } from "./seedVisibleCase.ts";
import { putCaseMedia } from "./putCaseMedia.ts";

/** Disposable visible case, without resetting anybody else's archive. */
export async function seedAskingAndOccasions(options: {
  capturedOn?: string;
  label: string;
}): Promise<{ itemId: string; tagId: string; personId: string }> {
  const uploader = await seedMemberAtAddress({
    email: UPLOADER_EMAIL,
    role: "uploader",
  });
  const asker = await seedMemberAtAddress({
    email: ASKER_EMAIL,
    role: "viewer",
  });
  const admin = await seedMemberAtAddress({ email: ADMIN_EMAIL });
  const database = createDatabase(E2E_DATABASE_PATH);
  try {
    const personId = await seedPeopleFromMembers({
      database,
      memberId: asker.memberId,
      name: "Inés Álvarez",
    });
    const adminPersonId = await seedPeopleFromMembers({
      database,
      memberId: admin.memberId,
      name: "Abuela",
    });
    await database
      .updateTable("members")
      .set({ display_name: "Papá Émile" })
      .where("id", "=", uploader.memberId)
      .execute();
    const { itemId, tagId } = await seedVisibleCase(
      database,
      uploader.memberId,
      personId,
      adminPersonId,
      options,
    );
    await putCaseMedia(database, itemId);
    return { itemId, tagId, personId };
  } finally {
    await database.destroy();
  }
}
