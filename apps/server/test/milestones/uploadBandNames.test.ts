import { expect, it } from "vitest";
import { readMilestoneNamesByDay } from "../../src/upload/enqueueUploadSessionEmails/uploadEmailMessageHelpers.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertMilestone } from "../helpers/seedHelpers/seedHelpers.ts";
it("uses only globally opening bands for upload day names", async () => {
  const { database, close } = await createTestApp();
  await insertMilestone(database, {
    name: "First week",
    startsOn: "2026-09-17",
    endsOn: "2026-09-21",
  });
  await insertMilestone(database, { name: "Home", startsOn: "2026-09-17" });
  expect(
    await readMilestoneNamesByDay({
      transaction: database,
      days: ["2026-09-17", "2026-09-20", "2026-09-21"],
    }),
  ).toEqual(
    new Map([
      ["2026-09-17", "Home"],
      ["2026-09-21", "First week"],
    ]),
  );
  expect(
    await readMilestoneNamesByDay({
      transaction: database,
      days: ["2026-09-20"],
    }),
  ).toEqual(new Map());
  expect(
    await readMilestoneNamesByDay({ transaction: database, days: [] }),
  ).toEqual(new Map());
  await close();
});
