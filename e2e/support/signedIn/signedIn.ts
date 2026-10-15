import { meResponseSchema } from "@memory-shoebox/shared";
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { seedMemberAtAddress } from "../database.ts";
import { getSharedSessionStoreOptionsFromCatalogLock } from "../deleteE2eCatalog.ts";
import { E2E_BASE_URL } from "../e2eEnvironment.constants.ts";
import {
  createSharedSessionStore,
  type SharedSessionState,
} from "../sharedSessionState/sharedSessionState.ts";
import { signInAs } from "../signIn.ts";

/**
 * One sign-in per address per run, shared by every spec that needs a session.
 *
 * **The budget is the reason this exists.** Twenty sign-in codes an hour are
 * allowed per IP, the whole suite shares that one bucket because every request
 * comes from `127.0.0.1`, and `signIn.ts` counts every mint against the rule the
 * server actually applies. A spec signing in per test spends the budget and the
 * failure lands somewhere else, as a `429` surfacing as a timeout on the code
 * field in whichever file runs next.
 *
 * `contrast.spec.ts` and the keyboard cases in `e2e/account/` already did this
 * by hand, in a `beforeAll` handing storage state to every context. This is the
 * same thing as a fixture, so a new spec gets it by asking rather than by
 * remembering.
 *
 * **A test that ends the session it is given must not use these.** Both
 * fixtures hand out one server-side session row per address, reached from a
 * fresh context each time, so signing out on one page signs out every later
 * page in the run. The keyboard sign-out case in `account.keyboard.spec.ts`
 * therefore still mints its own code, and says so.
 *
 * **It does not replace the counter.** A fixture is a way of spending fewer
 * mints, not a reason to stop counting them.
 */

/** The admin the suite has always used. Sees everything, including the doors. */
export const ADMIN_EMAIL = "abuela@example.com";

/**
 * A plain viewer, for everything an admin cannot observe.
 *
 * An admin's query is handed back untouched by the visibility filter
 * (`apps/server/src/visibility/applyVisibilityFilter.ts`), so a restricted item
 * is only restricted from somebody who is not one. The lock chip, the tag that
 * reads zero and the two degenerate bursts are all invisible to the admin.
 */
export const VIEWER_EMAIL = "prima@example.com";

/** A cached cookie is never authority: validate the current account on every context. */
async function _validateAccount(
  context: BrowserContext,
  state: SharedSessionState,
): Promise<void> {
  const response = await context.request.get(`${E2E_BASE_URL}/api/me`);
  if (response.status() !== 200) {
    throw new Error(
      `Shared E2E session account read returned ${response.status()}; refusing to mint a replacement.`,
    );
  }
  const { me } = meResponseSchema.parse(await response.json());
  if (
    me.member.memberId !== state.memberId ||
    me.email !== state.email ||
    me.role !== state.role
  ) {
    throw new Error(
      "Shared E2E session account identity or role changed; refusing to reseed or mint a replacement.",
    );
  }
}

/** Mint only a missing entry through the real UI, retaining its exact member identity. */
async function _mintState(
  context: BrowserContext,
  email: string,
  role: SharedSessionState["role"],
): Promise<SharedSessionState> {
  const { memberId } = await seedMemberAtAddress({ email, role });
  const page = await context.newPage();
  try {
    await page.goto("/sign-in");
    await signInAs({ page, email });
    await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
    return {
      email,
      role,
      memberId,
      storageState: await context.storageState(),
    };
  } finally {
    await page.close();
  }
}

/** A fresh validated context from the browser and exact run-owned account identity. */
export async function getSignedInContextFromBrowser(options: {
  browser: Browser;
  email: string;
  role: "admin" | "viewer";
}): Promise<BrowserContext> {
  const store = createSharedSessionStore(
    getSharedSessionStoreOptionsFromCatalogLock(),
  );
  const email = options.email.trim().toLowerCase();
  const cached = store.read(email, options.role);
  const context = await options.browser.newContext({
    storageState: cached?.storageState,
  });
  try {
    const state = cached ?? (await _mintState(context, email, options.role));
    await _validateAccount(context, state);
    if (!cached) {
      store.write(state);
    }
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
}

/**
 * `test` with two extra fixtures: a signed-in admin and a signed-in viewer.
 *
 * Playwright calls the second parameter of a fixture `use` in its own
 * documentation, and it is `provide` here for one reason: `oxlint` runs
 * `react-hooks/rules-of-hooks` over every `.ts` file in the repository, and to
 * that rule a bare call to something named `use` is React's `use` hook being
 * called outside a component. The name is the caller's to choose, so this
 * chooses one that is not a hook's.
 */
export const test = base.extend<{ adminPage: Page; viewerPage: Page }>({
  adminPage: async ({ browser }, provide) => {
    const context = await getSignedInContextFromBrowser({
      browser,
      email: ADMIN_EMAIL,
      role: "admin",
    });
    try {
      await provide(await context.newPage());
    } finally {
      await context.close();
    }
  },
  viewerPage: async ({ browser }, provide) => {
    const context = await getSignedInContextFromBrowser({
      browser,
      email: VIEWER_EMAIL,
      role: "viewer",
    });
    try {
      await provide(await context.newPage());
    } finally {
      await context.close();
    }
  },
});

export { expect };
