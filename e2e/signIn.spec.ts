import { expect, test, type Page } from "@playwright/test";
import { readSignInCode, seedMemberAtAddress } from "./support/database.ts";
import { E2E_BASE_URL } from "./support/e2eEnvironment.ts";
import {
  askForACode,
  signInAs,
  ASK_FOR_A_CODE,
  CODE_LABEL,
  EMAIL_LABEL,
  OPEN_THE_PHOTOS,
} from "./support/signIn.ts";

/**
 * Surface 1 against the real server: the arrival flow, and the four refusals
 * that decide whether the least technical person in the family gets in.
 *
 * **Every test owns its own address.** One catalog and one worker mean the
 * specs share a Shoebox, and an address is the only thing a sign-in is keyed
 * on: a shared one would make a code minted by one test reachable from
 * another, and the order they happen to run in would start to matter. It also
 * keeps each test well inside the per-address caps of five mints and ten
 * redemptions an hour.
 */

/**
 * Three wrong codes, none of them the real one and none of them each other.
 *
 * Derived from the real code rather than invented, because an invented six
 * digits is right one time in a million and a test that fails one run in a
 * million is worse than no test.
 */
function _makeWrongCodesFromCode(code: string): [string, string, string] {
  const lastDigit = Number(code.slice(5));
  // A tuple rather than an array, so destructuring the three of them gives
  // three strings. `noUncheckedIndexedAccess` would otherwise hand each of
  // them over as possibly undefined, and the cast that silenced that would be
  // a place a missing code could hide as the six characters "undefined".
  const wrongCode = (offset: number): string => {
    return `${code.slice(0, 5)}${(lastDigit + offset) % 10}`;
  };
  return [wrongCode(1), wrongCode(2), wrongCode(3)];
}

/**
 * Asks for a code and photographs the answer, with the address covered.
 *
 * The two masks are the only two places the address is on the screen: the
 * field it was typed into, and the bold copy in the body. Everything else in
 * the picture is the server's answer, which is the thing under test.
 */
async function _photographTheAnswer(
  page: Page,
  email: string,
): Promise<Buffer> {
  await page.goto("/sign-in");
  await askForACode({ page, email });
  // The faces are self-hosted and declared `font-display: swap`, so a cold
  // page paints in the fallback and repaints when the woff2 arrives. Without
  // this wait the first photograph is occasionally a picture of the fallback
  // and the second is never one, and the comparison fails over a font rather
  // than over anything the server said.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return await page.screenshot({
    animations: "disabled",
    mask: [page.getByLabel(EMAIL_LABEL), page.locator("b")],
  });
}

test("an invited address arrives, asks for a code and lands on the pile", async ({
  page,
}) => {
  const email = "arrival@example.com";
  await seedMemberAtAddress({ email });

  await page.goto("/sign-in");
  await expect(
    page.getByText("We will email you a six-digit code."),
  ).toBeVisible();

  await signInAs({ page, email });

  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
  await expect(page.getByText("Welcome in.")).toBeVisible();
});

test("a member and a stranger get answers nobody could tell apart", async ({
  page,
}) => {
  // The same length, and differing only in a digit, so the two masks that
  // cover the address have the same box: digits share an advance width in
  // every font this app can fall back to, where two letters would not, and a
  // wider mask would reflow the paragraph around it and fail the comparison
  // for a reason that has nothing to do with the server.
  const member = "twin-1@example.com";
  const stranger = "twin-2@example.com";
  await seedMemberAtAddress({ email: member });

  const memberAnswer = await _photographTheAnswer(page, member);
  const strangerAnswer = await _photographTheAnswer(page, stranger);

  // Two server answers compared, rather than two client branches: the surface
  // has no `unknown` state to test, because `POST /api/auth/sign-in-codes`
  // gives it nothing to build one from.
  //
  // **Byte-exact, and no tolerance is coming.** This is not a golden file
  // checked in against a baseline, where a pixel threshold absorbs a font
  // hint or a rounding difference between one machine and the next. It is two
  // answers from one server, photographed in one browser, in one run, seconds
  // apart: anything that differs at all differs because the server said
  // something different. A tolerance here would let through exactly the small
  // structured differences a membership oracle produces, an extra sentence,
  // a button that is there for one address and not the other, a countdown
  // that only a real member sees, which is the whole of what this test
  // exists to catch. If this ever fails, the answer is to look at the
  // attached screenshots, not to loosen the comparison.
  expect(Buffer.compare(memberAnswer, strangerAnswer)).toBe(0);
});

test("three wrong codes count down and then mint a replacement", async ({
  page,
}) => {
  const email = "countdown@example.com";
  await seedMemberAtAddress({ email });

  await page.goto("/sign-in");
  await askForACode({ page, email });
  const firstCode = await readSignInCode(email);
  const [firstWrong, secondWrong, thirdWrong] =
    _makeWrongCodesFromCode(firstCode);

  await page.getByLabel(CODE_LABEL).fill(firstWrong);
  await page.getByRole("button", { name: OPEN_THE_PHOTOS }).click();
  await expect(page.getByText("Two tries left")).toBeVisible();

  await page.getByLabel(CODE_LABEL).fill(secondWrong);
  await page.getByRole("button", { name: OPEN_THE_PHOTOS }).click();
  await expect(page.getByText("One try left")).toBeVisible();

  await page.getByLabel(CODE_LABEL).fill(thirdWrong);
  await page.getByRole("button", { name: OPEN_THE_PHOTOS }).click();
  await expect(
    page.getByText(
      "That was the last try, so that code has stopped working. A new one is on its way.",
    ),
  ).toBeVisible();

  // The promise the countdown makes: a new code really is on its way, and it
  // is a different one.
  const replacement = await readSignInCode(email);
  expect(replacement).toMatch(/^\d{6}$/);
  expect(replacement).not.toBe(firstCode);
});

test("a code that has been spent reads as expired", async ({ page }) => {
  const email = "spent@example.com";
  await seedMemberAtAddress({ email });

  await page.goto("/sign-in");
  const spentCode = await signInAs({ page, email });
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);

  // Superseding a code with "Send another" does **not** produce this copy, so
  // the plan's version of this case could not have passed: a fresh code is
  // live by then, the old digits are measured against it, and the server
  // answers `sign_in_code_invalid`. The `410` this asserts is what
  // `redeemSignInCode` returns when there is no live code at all, and using
  // one is the way somebody reaches that: the same email, opened again on a
  // second device.
  await page.goto(`/sign-in?email=${encodeURIComponent(email)}&sent=true`);
  await page.getByLabel(CODE_LABEL).fill(spentCode);
  await page.getByRole("button", { name: OPEN_THE_PHOTOS }).click();

  await expect(
    page.getByText(
      "That code has expired. They last ten minutes. Send another and use the newest email.",
    ),
  ).toBeVisible();
});

test("a link into an item signs you in and then opens the item", async ({
  page,
}) => {
  const email = "deep-link@example.com";
  await seedMemberAtAddress({ email });

  await page.goto("/items/abc");
  await expect(page).toHaveURL(
    `${E2E_BASE_URL}/sign-in?redirect=%2Fitems%2Fabc`,
  );

  await signInAs({ page, email });

  // A URL in this product is an address rather than a credential, so signing
  // in finishes the journey somebody started.
  await expect(page).toHaveURL(`${E2E_BASE_URL}/items/abc`);
});

test("a redirect to somewhere else lands on the pile instead", async ({
  page,
}) => {
  const email = "open-redirect@example.com";
  await seedMemberAtAddress({ email });

  await page.goto("/sign-in?redirect=https%3A%2F%2Fexample.com");
  await signInAs({ page, email });

  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
  expect(new URL(page.url()).origin).toBe(E2E_BASE_URL);
});

test("the whole flow works with the keyboard alone", async ({ page }) => {
  const email = "keyboard@example.com";
  await seedMemberAtAddress({ email });

  await page.goto("/sign-in");
  // `body.press` rather than `keyboard.press` for the first key only. A real
  // browser window has focus, so Tab starts from the top of the document;
  // a page Playwright has just opened has none, and the key goes nowhere.
  // Pressing it on the body is what a focused window gives for free, and it
  // is still a key rather than a click: every step after this one is
  // `keyboard`.
  await page.locator("body").press("Tab");
  await expect(page.getByLabel(EMAIL_LABEL)).toBeFocused();
  await page.keyboard.type(email);
  await page.keyboard.press("Enter");

  await expect(page.getByLabel(CODE_LABEL)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(CODE_LABEL)).toBeFocused();
  await page.keyboard.type(await readSignInCode(email));
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
});

test("the card fits a phone, and a desktop at 200% zoom", async ({ page }) => {
  // 400x800 is a phone. 640x450 is what a 1280x900 window becomes at 200%
  // zoom, which is the reflow case WCAG 1.4.10 is about and the one that
  // catches a card with a fixed width.
  for (const viewport of [
    { width: 400, height: 800 },
    { width: 640, height: 450 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/sign-in");

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(
      overflow,
      `sideways scroll at ${viewport.width}px`,
    ).toBeLessThanOrEqual(0);
    await expect(
      page.getByRole("button", { name: ASK_FOR_A_CODE }),
    ).toBeVisible();
  }
});
