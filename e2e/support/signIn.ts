import { expect, type Page } from "@playwright/test";
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
 * Types the address and asks for a code, and returns once the server has
 * answered.
 *
 * The wait is on the code field appearing, which the surface draws only after
 * the `202`. That is also what makes `readSignInCode` safe to call next: the
 * row is committed before the response goes out.
 *
 * @param options.page A page already showing surface 1.
 * @param options.email The address to ask for a code at.
 */
export async function askForACode(options: {
  page: Page;
  email: string;
}): Promise<void> {
  const { page, email } = options;
  await page.getByLabel(EMAIL_LABEL).fill(email);
  await page.getByRole("button", { name: ASK_FOR_A_CODE }).click();
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
 * @param options.page A page already showing surface 1.
 * @param options.email The address to sign in as. It must already be a member.
 * @returns The six digits it signed in with, which a caller may want to reuse.
 */
export async function signInAs(options: {
  page: Page;
  email: string;
}): Promise<string> {
  const { page, email } = options;
  await askForACode({ page, email });
  const code = await readSignInCode(email);
  await page.getByLabel(CODE_LABEL).fill(code);
  await page.getByRole("button", { name: OPEN_THE_PHOTOS }).click();
  return code;
}
