import { createTestApp, type TestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertMilestone } from "../../../helpers/seedHelpers/seedHelpers.ts";
/** Runs an assertion in a signed-in picker app and closes it afterward. */
export async function withPickerContext(
  options: Readonly<{
    endpoint: string;
    assertion: (context: Readonly<PickerTestContext>) => Promise<void>;
  }>,
): Promise<void> {
  const testApp = await createTestApp();
  try {
    const { cookie } = await insertSignedInMember({
      database: testApp.database,
    });
    const milestoneId = await insertMilestone(testApp.database, {
      name: "Empty",
      startsOn: "2026-09-27",
    });
    await options.assertion({
      ...testApp,
      cookie,
      milestoneId,
      endpoint: options.endpoint,
    });
  } finally {
    await testApp.close();
  }
}

/** A picker test app with its session, empty milestone, and endpoint. */
export type PickerTestContext = TestApp & {
  cookie: string;
  milestoneId: string;
  endpoint: string;
};
