import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import type { TestApp } from "./createTestApp.ts";

import { createOwnedTestApp } from "./createOwnedTestApp/createOwnedTestApp.ts";
import { NOW, insertInstanceSetting } from "./seedHelpers/seedHelpers.ts";

/** Shared mailHealth test input. */
export const ADMIN = {
  memberId: "admin",
  sessionId: "session",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const satisfies Viewer;

/** Provides the mailHealth test fixture for catalog behavior. */
export async function createConfiguredMailHealthApp(): Promise<TestApp> {
  const testApp = await createOwnedTestApp({
    authenticate: async () => {
      return ADMIN;
    },
    clock: () => {
      return new Date(NOW);
    },
    mailDomainReader: async () => {
      return { isVerified: true, error: undefined };
    },
  });
  await insertInstanceSetting(testApp.database, {
    key: "public.base_url",
    value: "https://family.example.com",
  });
  await insertInstanceSetting(testApp.database, {
    key: "mail.from_address",
    value: "photos@example.com",
  });
  return testApp;
}
