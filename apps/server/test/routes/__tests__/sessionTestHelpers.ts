import { createTestApp, type TestApp } from "../../helpers/createTestApp.ts";
import {
  NOW,
  insertInstanceSetting,
} from "../../helpers/seedHelpers/seedHelpers.ts";

/** The header a phone sends, from which the device label is read. */
export const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

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
