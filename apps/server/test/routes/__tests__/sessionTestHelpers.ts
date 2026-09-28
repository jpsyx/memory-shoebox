import { createTestApp, type TestApp } from "../../helpers/createTestApp.ts";
import {
  NOW,
  insertInstanceSetting,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/** An app whose clock stands still, with mail configured. */
export async function createSessionApp(): Promise<TestApp> {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  await insertInstanceSetting(testApp.database, {
    key: "public.base_url",
    value: "https://shoebox.example.com",
  });
  return testApp;
}
