import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { seedMemberAtAddress } from "./database.ts";
import { E2E_BASE_URL } from "./e2eEnvironment.ts";
import { signInAs } from "./signIn.ts";

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

/** One storage state per address, captured once and reused for the run. */
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const stateByEmail = new Map<string, StorageState>();

/**
 * Signs one address in, once, and hands back its storage state.
 *
 * The body is the same sequence `contrast.spec.ts` and the account keyboard
 * spec already ran in their own `beforeAll`: seed the member, drive surface 1
 * through `signInAs`, wait for the pile, take the state. The only new thing is
 * the cache, which is what turns one sign-in per file into one per run.
 */
async function _stateFor(options: {
  browser: Browser;
  email: string;
  role: "admin" | "viewer";
}): Promise<StorageState> {
  const cached = stateByEmail.get(options.email);
  if (cached !== undefined) {
    return cached;
  }
  await seedMemberAtAddress({ email: options.email, role: options.role });
  const context = await options.browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/sign-in");
    await signInAs({ page, email: options.email });
    await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
    const state = await context.storageState();
    stateByEmail.set(options.email, state);
    return state;
  } finally {
    await context.close();
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
    const context = await browser.newContext({
      storageState: await _stateFor({
        browser,
        email: ADMIN_EMAIL,
        role: "admin",
      }),
    });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
  viewerPage: async ({ browser }, provide) => {
    const context = await browser.newContext({
      storageState: await _stateFor({
        browser,
        email: VIEWER_EMAIL,
        role: "viewer",
      }),
    });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

export { expect };
