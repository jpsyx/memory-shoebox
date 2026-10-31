import {
  test as base,
  expect,
  type Page,
  type Locator,
  type Response,
} from "@playwright/test";
import {
  runCommentTaggingServer,
  type CommentTaggingCatalog,
} from "./runCommentTaggingServer.ts";

/** Each case owns new sessions, database, app port and bucket port. */
export const test = base.extend<{ catalog: CommentTaggingCatalog }>({
  catalog: async ({ browserName }, provide) => {
    void browserName;
    const catalog = await runCommentTaggingServer();
    try {
      expect(process.env.NODE_ENV).toBe("development");
      expect(process.env.ENABLE_FAKE_EMAIL).toBe("true");
      expect(catalog.app.emailService).toBe(catalog.sender);
      expect(catalog.app.mailDomainReader).toBeUndefined();
      await provide(catalog);
    } finally {
      await catalog.close();
    }
  },
  baseURL: async ({ catalog }, provide) => {
    await provide(catalog.origin);
  },
});

/** Install a real catalog session without adding a product test endpoint. */
export async function signIn(
  page: Page,
  catalog: CommentTaggingCatalog,
  name: keyof CommentTaggingCatalog["members"] = "Ana",
): Promise<void> {
  await page.context().addCookies([
    {
      name: "shoebox_session",
      value: catalog.members[name].token,
      url: catalog.origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** Explicit picker selection establishes a reference; plain fill never does. */
export async function selectTag(
  page: Page,
  field: Locator,
  name = "Jorge",
): Promise<void> {
  await field.scrollIntoViewIfNeeded();
  await expect(field).toBeInViewport();
  await field.press("End");
  await field.pressSequentially(`@${name}`);
  await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("option", { name: `${name} (not a member)` }),
  ).toHaveCount(0);
  const option = page.getByRole("option", { name, exact: true });
  await expect(field).toBeFocused();
  await expect(option).toBeInViewport();
  const typedBody = await field.inputValue();
  if (page.context().browser()?.browserType().name() === "webkit") {
    await _clickVisibleOption(page, option);
  } else {
    await option.click();
  }
  await expect(field).toHaveValue(`${typedBody} `);
  await expect(option).toHaveCount(0);
  await expect
    .poll(async () => {
      return field.evaluate((element: HTMLTextAreaElement) => {
        return [element.selectionStart, element.selectionEnd];
      });
    })
    .toEqual([typedBody.length + 1, typedBody.length + 1]);
  await expect(field).toBeFocused();
}

/** Wait for the actual application response before inspecting persisted state. */
export async function submitComment(
  page: Page,
  field: Locator,
): Promise<Response> {
  await field.press("Escape");
  const responsePromise = page.waitForResponse((response) => {
    return (
      response.url().includes("/comments") &&
      ["POST", "PATCH"].includes(response.request().method())
    );
  });
  await field.press("Control+Enter");
  return responsePromise;
}

/** Assertions remain web-first rather than fixed-time screenshots. */
export { expect };

async function _clickVisibleOption(page: Page, option: Locator): Promise<void> {
  // WebKit locator scrolling can move this already visible portal offscreen.
  await expect
    .poll(async () => {
      return option.evaluate(async (element) => {
        const before = element.getBoundingClientRect();
        await new Promise<void>((settle) => {
          requestAnimationFrame(() => {
            settle();
          });
        });
        const after = element.getBoundingClientRect();
        return (
          before.x === after.x &&
          before.y === after.y &&
          element.contains(
            document.elementFromPoint(
              after.x + after.width / 2,
              after.y + after.height / 2,
            ),
          )
        );
      });
    })
    .toBe(true);
  const box = await option.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}
