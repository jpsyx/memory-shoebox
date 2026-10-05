import { onTestFinished } from "vitest";
import { createTestApp, type TestApp } from "../createTestApp.ts";

/** Returns a real test app whose cleanup survives failed fixture setup. */
export async function createOwnedTestApp(
  overrides: Readonly<NonNullable<Parameters<typeof createTestApp>[0]>> = {},
): Promise<TestApp> {
  const context = await createTestApp(overrides);
  let closePromise: Promise<void> | undefined;
  const owned = {
    ...context,
    close: () => {
      closePromise ??= context.close();
      return closePromise;
    },
  };
  onTestFinished(() => {
    return owned.close();
  });
  return owned;
}
