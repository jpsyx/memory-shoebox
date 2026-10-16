import { expect, it } from "vitest";
import { createTestApp } from "../../../apps/server/test/helpers/createTestApp.ts";
import { insertMember } from "../../../apps/server/test/helpers/seedHelpers/seedHelpers.ts";
import {
  insertItem,
  insertUploadSession,
} from "../../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import {
  getUploadCaseOwnershipFromDatabase,
  openUploadCaseDatabase,
  retireUploadCase,
} from "./uploadCaseRetirementHelpers.ts";

it("removes only new case items while preserving baseline items and sessions", async () => {
  const fixture = await createTestApp();
  try {
    const database = fixture.database;
    const uploaderId = await insertMember(database, {
      email: "case@example.com",
    });
    const outsiderId = await insertMember(database, {
      email: "other@example.com",
    });
    const oldSession = await insertUploadSession(database, {
      uploadedBy: uploaderId,
      state: "settled",
    });
    const baselineItem = await insertItem(database, {
      uploadedBy: uploaderId,
      upload_session_id: oldSession,
      seq: 1,
    });
    const ownership = await getUploadCaseOwnershipFromDatabase({
      database,
      uploaderEmail: "case@example.com",
    });
    const newSession = await insertUploadSession(database, {
      uploadedBy: uploaderId,
      state: "settled",
    });
    const caseItem = await insertItem(database, {
      uploadedBy: uploaderId,
      upload_session_id: newSession,
      seq: 2,
    });
    const outsiderItem = await insertItem(database, {
      uploadedBy: outsiderId,
      upload_session_id: newSession,
      seq: 3,
    });
    const lateOldSessionItem = await insertItem(database, {
      uploadedBy: uploaderId,
      upload_session_id: oldSession,
      seq: 4,
    });
    // Even a baseline identity moved into the case's session must survive.
    await database
      .updateTable("items")
      .set({ upload_session_id: newSession })
      .where("id", "=", baselineItem)
      .execute();
    await retireUploadCase({ database, ownership });
    const remaining = (
      await database.selectFrom("items").select("id").execute()
    ).map((item) => {
      return item.id;
    });
    expect(remaining).not.toContain(caseItem);
    expect(remaining.sort()).toEqual(
      [baselineItem, outsiderItem, lateOldSessionItem].sort(),
    );
    expect(
      (await database.selectFrom("upload_sessions").select("id").execute())
        .map((session) => {
          return session.id;
        })
        .sort(),
    ).toEqual([oldSession, newSession].sort());
  } finally {
    await fixture.close();
  }
});

it("rejects a catalog that merely shares the expected filename before opening it", () => {
  expect(() => {
    return openUploadCaseDatabase("/tmp/unowned/e2e.db");
  }).toThrow("exact owned E2E catalog");
});
