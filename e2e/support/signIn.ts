import { expect, type Page } from "@playwright/test";
import { RATE_LIMIT_RULES } from "../../apps/server/src/http/rateLimit/rateLimit.constants.ts";
import { readSignInCode } from "./database.ts";

/**
 * Surface 1, driven the way somebody with a keyboard drives it.
 *
 * **Every spec that needs a session comes through here.** The account spec
 * needs the same flow the sign-in spec already had, and a second copy would
 * mean the product's own copy is written twice: change a button label and one
 * file starts failing for the wrong reason while the other is fixed.
 *
 * **Nothing here posts to the API.** A helper that short-circuited the form
 * by calling `POST /api/auth/session` itself would hand the account tests a
 * session the product did not make, and the thing those tests are for is
 * proving that a session the product made actually works.
 */

/** The address field on surface 1. Also the read-only one on surface 9. */
export const EMAIL_LABEL = "Your email";

/** The code field, which the surface draws only once a code has been sent. */
export const CODE_LABEL = "The six digits we just emailed you";

/** The button that asks for a code. */
export const ASK_FOR_A_CODE = "Email me a code";

/** The button that spends one. */
export const OPEN_THE_PHOTOS = "Open the photos";

/**
 * How many sign-in codes one address may ask for in an hour, read from the
 * rule the server actually applies rather than copied into a comment.
 *
 * The per-IP rule is the binding one for this suite: every request in a run
 * comes from `127.0.0.1`, so the whole suite shares one bucket, while the
 * per-address caps are spent two at a time by specs that each own their own
 * address. `e2e/support/database.ts` already reaches across this boundary for
 * the same reason, that the end-to-end layer is entitled to know what the
 * server under test is configured to do.
 */
const MINTS_PER_HOUR_PER_IP =
  RATE_LIMIT_RULES.signInCodeRequestPerIp.windows[0].limit;

/**
 * How many codes this run has asked for, across every spec.
 *
 * Playwright reuses one worker process for the whole run, and this suite is
 * configured for exactly one worker, so this counts the run rather than the
 * file, and it was checked against the server's own tally request by request
 * rather than assumed.
 *
 * It is a floor rather than a mirror: a worker replaced mid-run starts again
 * from zero while the server's bucket does not, so the guard can under-count
 * and never over-count. An under-count costs nothing that was not already
 * being paid, because it lands the failure exactly where it used to land, on
 * a `429`.
 */
let mintsThisRun = 0;

/**
 * Charges one code to the run's budget, and refuses before asking for it if
 * that would exceed what the server will allow.
 *
 * **This exists because the budget used to be enforced by prose.** The count
 * was right, but only because it had been hand-totalled across two files, and
 * nothing made it executable. A ninth sign-in added anywhere would have spent
 * the budget and surfaced as a bare `toBeVisible` timeout on the code field,
 * in whichever spec ran after it ran out: files run alphabetically under one
 * worker, so a mint added to `account.spec.ts` failed `signIn.spec.ts`, in a
 * test that had nothing to do with the change, with the real cause, a `429`,
 * visible only in the trace.
 *
 * So it throws here, at the mint that broke it, naming the budget and the
 * count.
 */
function _chargeOneMintToTheRun(email: string): void {
  mintsThisRun += 1;
  if (mintsThisRun > MINTS_PER_HOUR_PER_IP) {
    throw new Error(
      `This run has asked for ${mintsThisRun} sign-in codes and the server allows ` +
        `${MINTS_PER_HOUR_PER_IP} an hour (RATE_LIMIT_RULES.signInCodeRequestPerIp), ` +
        "which the whole suite shares because every request in a run comes from 127.0.0.1. " +
        `The code for ${email} would come back as a 429, and the specs after it would fail ` +
        "for reasons that have nothing to do with them. Remove a sign-in, share a session " +
        "between tests, or raise the rule.",
    );
  }
}

/**
 * Types the address and asks for a code, and returns once the server has
 * answered.
 *
 * The wait is on the code field appearing, which the surface draws only after
 * the `202`. That is also what makes `readSignInCode` safe to call next: the
 * row is committed before the response goes out.
 *
 * This and `askForACodeWithTheKeyboard` are the only two ways the suite asks
 * for a code, which is what makes the budget above countable at all.
 *
 * @param options.page A page already showing surface 1.
 * @param options.email The address to ask for a code at.
 */
export async function askForACode(options: {
  page: Page;
  email: string;
}): Promise<void> {
  const { page, email } = options;
  _chargeOneMintToTheRun(email);
  await page.getByLabel(EMAIL_LABEL).fill(email);
  await page.getByRole("button", { name: ASK_FOR_A_CODE }).click();
  await expect(page.getByLabel(CODE_LABEL)).toBeVisible();
}

/**
 * The same request, typed and submitted with keys and nothing else.
 *
 * **It is here rather than in the spec so that the budget above can be
 * trusted.** The keyboard case cannot use `askForACode`, which types with
 * `fill` and submits with a click, and for a while it therefore made its mint
 * by reaching past the driver entirely. That one uncounted request was enough
 * to put the guard a mint behind the server, which is exactly the failure the
 * guard exists to prevent, and it was found by counting requests on both
 * sides of the wire rather than by reading the code. Every way of asking for
 * a code now goes through this file.
 *
 * The focus assertion is part of the helper rather than the caller: typing
 * into a field nobody has proved is focused is not a keyboard test.
 *
 * @param options.page A page showing surface 1, with the address field
 *   already focused by whatever sequence of keys the caller is testing.
 * @param options.email The address to ask for a code at.
 */
export async function askForACodeWithTheKeyboard(options: {
  page: Page;
  email: string;
}): Promise<void> {
  const { page, email } = options;
  _chargeOneMintToTheRun(email);
  await expect(page.getByLabel(EMAIL_LABEL)).toBeFocused();
  await page.keyboard.type(email);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel(CODE_LABEL)).toBeVisible();
}

/**
 * The whole flow, driven through the surface rather than the API.
 *
 * It does not navigate and it does not assert where the browser lands, on
 * purpose: surface 1 is reached four different ways (typed, redirected from a
 * guarded URL, resumed from `?sent=true`, and sent somewhere it will refuse
 * to go), and each caller already knows which of those it set up and where it
 * expects to end up.
 *
 * **It hands nothing back.** A driver whose whole point is that it proves the
 * interface works should not also be the place a credential comes out of: the
 * next spec wanting a shortcut would find one here. The one test that needs
 * the digits it spent reads them from `readSignInCode`, which is exported and
 * is where reading a code belongs.
 *
 * @param options.page A page already showing surface 1.
 * @param options.email The address to sign in as. It must already be a member.
 */
export async function signInAs(options: {
  page: Page;
  email: string;
}): Promise<void> {
  const { page, email } = options;
  await askForACode({ page, email });
  await page.getByLabel(CODE_LABEL).fill(await readSignInCode(email));
  await page.getByRole("button", { name: OPEN_THE_PHOTOS }).click();
}
