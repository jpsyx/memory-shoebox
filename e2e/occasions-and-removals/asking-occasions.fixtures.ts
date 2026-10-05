import { mkdir, chmod } from "node:fs/promises";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test as base, expect } from "../support/signedIn.ts";
import { seedMemberAtAddress } from "../support/database.ts";
import { signInAs } from "../support/signIn.ts";
import {
  ASKER_EMAIL,
  UPLOADER_EMAIL,
  ACCEPTANCE_DIRECTORY,
} from "./asking-occasions.constants.ts";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
const stateByEmail = new Map<string, StorageState>();

async function _actorState(options: {
  browser: Browser;
  email: string;
  role: "viewer" | "uploader";
}): Promise<StorageState> {
  const cached = stateByEmail.get(options.email);
  if (cached) return cached;
  await seedMemberAtAddress(options);
  const context = await options.browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/sign-in");
    await signInAs({ page, email: options.email });
    await expect(page).toHaveURL("http://localhost:8099/");
    const state = await context.storageState();
    stateByEmail.set(options.email, state);
    return state;
  } finally {
    await context.close();
  }
}

async function _provideActor(options: {
  browser: Browser;
  email: string;
  role: "viewer" | "uploader";
  provide: (page: Page) => Promise<void>;
  handoff: string;
}): Promise<void> {
  const context = await options.browser.newContext({
    storageState: await _actorState(options),
  });
  try {
    await mkdir(ACCEPTANCE_DIRECTORY, { recursive: true });
    const path = `${ACCEPTANCE_DIRECTORY}/${options.handoff}-storage.json`;
    await context.storageState({ path });
    await chmod(path, 0o600);
    await options.provide(await context.newPage());
  } finally {
    await context.close();
  }
}

/** Three independent contexts with cached sessions; admin is the borrowed fixture. */
export const test = base.extend<{
  askerPage: Page;
  uploaderPage: Page;
  handoffAdmin: void;
}>({
  askerPage: async ({ browser }, provide) => {
    await _provideActor({
      browser,
      email: ASKER_EMAIL,
      role: "viewer",
      provide,
      handoff: "asker",
    });
  },
  uploaderPage: async ({ browser }, provide) => {
    await _provideActor({
      browser,
      email: UPLOADER_EMAIL,
      role: "uploader",
      provide,
      handoff: "uploader",
    });
  },
  handoffAdmin: [
    async ({ adminPage }, provide) => {
      await mkdir(ACCEPTANCE_DIRECTORY, { recursive: true });
      const path = `${ACCEPTANCE_DIRECTORY}/admin-storage.json`;
      await adminPage.context().storageState({ path });
      await chmod(path, 0o600);
      await provide();
    },
    { auto: true },
  ],
});
export { expect };
