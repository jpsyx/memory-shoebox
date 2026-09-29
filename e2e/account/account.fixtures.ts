import { expect, type Page } from "@playwright/test";
import { seedMemberAtAddress } from "../support/database.ts";
import { E2E_BASE_URL } from "../support/e2eEnvironment.ts";
import { signInAs } from "../support/signIn.ts";

/**
 * Surface 9 against the real server: the name the family sees, the four
 * switches, the five admin doors, and the one promise that cannot be checked
 * anywhere but here, that signing a device out really does stop it working.
 *
 * The suite is the three spec files beside this one, and this is where they
 * get their words, their sign-in, and the rules below.
 *
 * **Every test owns its own address**, for the reason `signIn.spec.ts` gives:
 * one catalog and one worker mean the specs share a Shoebox, and an address
 * is the only thing a sign-in is keyed on. Here it buys a second thing as
 * well: a member's device list is its own, so a test that signs devices in
 * and out cannot be reading or revoking rows another test is relying on, and
 * the order they run in stays a detail.
 *
 * The one exception is the keyboard pair at the foot of
 * `account.keyboard.spec.ts`, which share an address and one session
 * deliberately, to spend one code instead of two. They pay for it by being the
 * only two tests here whose order matters, and their docstring says so.
 *
 * **Every test here signs in, and sign-in codes are rationed.** The whole
 * suite shares one per-IP bucket. No number is written down in these files on
 * purpose: `e2e/support/signIn.ts` counts the mints as they happen and
 * refuses the one that would go over, against the rule the server actually
 * applies. A count in a comment here would be wrong the moment somebody
 * added a test, and a wrong comment is worse than none.
 */

/** The name field on surface 9, and the button that commits it. */
export const NAME_LABEL = "Your name";
export const SAVE_YOUR_NAME = "Save your name";

/** The four switches, by the label each one carries on screen. */
export const NOTIFY_LABELS = [
  "Somebody puts photographs up",
  "Somebody writes on something of yours",
  "Somebody writes on something you wrote on",
  "Somebody asks for a photograph to come down",
] as const;

/** The bulk row, which offers one button or the other and never both. */
export const TURN_THEM_ALL_OFF = "Turn them all off";
export const TURN_THEM_BACK_ON = "Turn them back on";

/**
 * The five doors only an admin can open, and where each one goes.
 *
 * Both halves are asserted: a door that is drawn and goes nowhere is the
 * failure this is really watching for, and the surface builds each one as an
 * anchor wearing a button's clothes, which is exactly the shape that can look
 * right and not navigate.
 */
export const ADMIN_DOORS = [
  { name: "Shoebox settings", path: "/settings" },
  { name: "Members and groups", path: "/members" },
  { name: "Milestones", path: "/milestones" },
  { name: "Who has been looking", path: "/presence" },
  { name: "Removal requests", path: "/removal-requests" },
] as const;

/** Every device row's button, whichever of the two words it carries. */
export const SIGN_OUT_ANY_DEVICE = /^Sign out/;

/** What marks the row you are reading the list on. */
export const THIS_ONE = "· this one";

/** Signs an already-seeded address in on this page and lands it on the pile. */
export async function signInOnThisPage(options: {
  page: Page;
  email: string;
}): Promise<void> {
  await options.page.goto("/sign-in");
  await signInAs(options);
  await expect(options.page).toHaveURL(`${E2E_BASE_URL}/`);
}

/**
 * Seeds an admin at `email`, signs in, and opens My account.
 *
 * The wait is on the name field, which is inside the suspense boundary: it is
 * on screen only once `GET /api/me` has answered, so no test below has to
 * think about whether the surface has finished arriving.
 */
export async function openMyAccount(options: {
  page: Page;
  email: string;
}): Promise<void> {
  await seedMemberAtAddress({ email: options.email });
  await signInOnThisPage(options);
  await options.page.goto("/account");
  await expect(options.page.getByLabel(NAME_LABEL)).toBeVisible();
}

/**
 * Does something that writes to `PATCH /api/me`, and returns once the server
 * has answered it.
 *
 * **Not a nicety.** A switch moves optimistically, the instant it is flipped,
 * so the control looks settled long before the write lands. Reloading on the
 * strength of that would be a race between the browser's navigation and the
 * request it is abandoning, and the test would fail on a slow machine and
 * pass on a fast one. Waiting on the response makes what is asserted after
 * the reload a statement about what the server stored.
 */
export async function writeAndWaitForTheAnswer(options: {
  page: Page;
  write: () => Promise<void>;
}): Promise<void> {
  const answered = options.page.waitForResponse((response) => {
    return (
      response.url().endsWith("/api/me") &&
      response.request().method() === "PATCH"
    );
  });
  await options.write();
  await answered;
}
