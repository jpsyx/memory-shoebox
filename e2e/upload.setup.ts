import { expect, test as setup } from "@playwright/test";
import { seedMemberAtAddress } from "./support/database.ts";
import { E2E_BASE_URL } from "./support/e2eEnvironment.ts";
import { signInAs } from "./support/signIn.ts";
import { activateMember } from "./support/uploadCatalog.ts";
import {
  FAMILY_EMAIL,
  UPLOADER_EMAIL,
  UPLOADER_STATE_PATH,
} from "./support/uploadHarness.ts";

/**
 * The upload projects' one sign-in, shared by Chrome and WebKit.
 *
 * **Its own project, because the two upload projects are two workers.** The
 * cache in `support/signedIn.ts` lives in a worker, so each browser signing
 * in for itself would spend two codes from the per-IP budget the whole suite
 * shares. This spends one, and leaves the state where both can read it.
 *
 * **It signs in through surface 1, in Chromium, for both browsers.** WebKit
 * cannot hold the `Secure` session cookie over `http://localhost` at all, so
 * driving surface 1 in WebKit would fail on the cookie rather than on
 * anything this suite tests; `getUploaderStorageState` hands WebKit the same
 * session without the attribute.
 *
 * It depends on the `chromium` project, which is what puts every upload
 * after `empty.spec.ts`: an upload writes items, and that spec needs none.
 */
setup("the uploader signs in once, for both browsers", async ({ page }) => {
  await seedMemberAtAddress({ email: UPLOADER_EMAIL, role: "uploader" });
  const family = await seedMemberAtAddress({
    email: FAMILY_EMAIL,
    role: "viewer",
  });
  await activateMember(family.memberId);

  await page.goto("/sign-in");
  await signInAs({ page, email: UPLOADER_EMAIL });
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
  await page.context().storageState({ path: UPLOADER_STATE_PATH });
});
