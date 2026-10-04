import type {
  CreateUploadEditRequest,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import { expect, type Locator, type Page } from "@playwright/test";
import { makeUploadSurfaceFixturePaths } from "../support/makeUploadSurfaceFixturePaths/makeUploadSurfaceFixturePaths.ts";
import { readSurfaceSession, test } from "./uploadSurfaceTestHelpers.ts";

test("surface 8 keyboard can choose files, client contract can tag people, attach an occasion, restrict visibility and commit", async ({
  uploaderPage: page,
}, testInfo) => {
  test.setTimeout(180_000);
  const paths = makeUploadSurfaceFixturePaths({
    directory: testInfo.outputPath("keyboard"),
    count: 1,
  });
  await _pickKeyboardFile({ page, paths });
  await _pressButton({ page: page, name: "Tick all 1" });
  await _keyboardLabel({
    page: page,
    button: "Add a tag",
    label: "Tags",
    value: "keyboard tag",
  });
  await _pressButton({ page: page, name: "Tick all 1" });
  await _keyboardLabel({
    page: page,
    button: "Tag somebody",
    label: "Who is in them",
    value: "Keyboard Cousin",
  });
  await _pressButton({ page: page, name: "Tick all 1" });
  const writes: KeyboardWrite[] = [];
  const detail = await readSurfaceSession({ request: page.request });
  await _installKeyboardContracts({ page, detail, writes });
  await _keyboardOccasion({ page, detail });
  await _keyboardRestriction(page);
  await _pressButton({ page: page, name: "Put 1 up" });
  await expect(
    page.getByRole("heading", { name: "Putting them up." }),
  ).toBeVisible();
  _expectKeyboardWrites({ writes, detail });
});
type KeyboardLabelOptions = {
  page: Page;
  button: string;
  label: string;
  value: string;
};

async function _keyboardLabel({
  page,
  button,
  label,
  value,
}: Readonly<KeyboardLabelOptions>): Promise<void> {
  await _pressButton({ page: page, name: button });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("opacity", "1");
  const field = page.getByRole("combobox", { name: label, exact: true });
  await _tabTo({ page: page, locator: field });
  await expect(field).toBeFocused();
  await page.keyboard.type(value);
  await expect(field).toHaveValue(value);
  await page.keyboard.press("Enter");
  await expect(field).toHaveValue("");
  if ((await field.getAttribute("aria-expanded")) === "true") {
    await page.keyboard.press("Escape");
  }
  await _tabTo({
    page: page,
    locator: dialog.getByRole("button", { name: "Close", exact: true }),
  });
  await page.keyboard.press(_keyboardTab({ page: page, isBackward: true }));
  await expect
    .poll(async () => {
      return dialog.evaluate((element) => {
        return element.contains(document.activeElement);
      });
    })
    .toBe(true);
  await _pressButton({ page: page, name: "Tag all 1" });
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Put it all up.", exact: true }),
  ).toBeFocused();
}

async function _pressButton({
  page,
  name,
}: Readonly<{ page: Page; name: string }>): Promise<void> {
  const button = page.getByRole("button", { name, exact: true });
  await _tabTo({ page: page, locator: button });
  await expect(button).toBeFocused();
  await expect
    .poll(async () => {
      return button.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          style.outlineStyle !== "none" &&
          Number.parseFloat(style.outlineWidth) >= 2
        );
      });
    })
    .toBe(true);
  await page.keyboard.press("Enter");
}

async function _tabTo({
  page,
  locator,
  remainingTabPresses = 100,
}: Readonly<{
  page: Page;
  locator: Locator;
  remainingTabPresses?: number;
}>): Promise<void> {
  if (
    await locator.evaluate((element) => {
      return element === document.activeElement;
    })
  ) {
    return;
  }
  if (remainingTabPresses === 0) {
    throw new Error(
      `Keyboard could not reach ${(await locator.getAttribute("aria-label")) ?? (await locator.textContent())}`,
    );
  }
  await page.keyboard.press(_keyboardTab({ page: page }));
  await _tabTo({
    page: page,
    locator: locator,
    remainingTabPresses: remainingTabPresses - 1,
  });
}

function _keyboardTab({
  page,
  isBackward = false,
}: Readonly<{ page: Page; isBackward?: boolean }>): string {
  const isMacWebKit =
    process.platform === "darwin" &&
    page.context().browser()?.browserType().name() === "webkit";
  return `${isMacWebKit ? "Alt+" : ""}${isBackward ? "Shift+" : ""}Tab`;
}

async function _pickKeyboardFile(
  options: Readonly<{ page: Page; paths: readonly string[] }>,
): Promise<void> {
  const { page, paths } = options;
  await _tabTo({
    page: page,
    locator: page.getByRole("button", { name: /Drop photos and videos here/ }),
  });
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(paths);
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeEnabled();
}

const KEYBOARD_OCCASION_ID = "018f0000-0000-7000-8000-000000008000";
const KEYBOARD_GROUP_ID = "018f0000-0000-7000-8000-000000008002";
type KeyboardWrite = { path: string; body: unknown };
type KeyboardContractOptions = {
  page: Page;
  detail: UploadSessionDetail;
  writes: KeyboardWrite[];
};

async function _keyboardOccasion({
  page,
}: Readonly<{ page: Page; detail: UploadSessionDetail }>): Promise<void> {
  await _pressButton({ page: page, name: "Put under a milestone" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Put under a milestone", exact: true }),
  ).toBeFocused();
  await _pressButton({ page: page, name: "Put under a milestone" });
  await expect(
    page.getByRole("button", { name: "Close milestone picker", exact: true }),
  ).toBeFocused();
  const occasion = page.getByRole("button", { name: /Keyboard occasion/ });
  await _tabTo({ page: page, locator: occasion });
  await page.keyboard.press("Enter");
  await expect(occasion).toHaveAttribute("aria-pressed", "true");
  await _pressButton({ page: page, name: "Attach 1" });
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Put it all up.", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("Keyboard occasion", { exact: true }).first(),
  ).toBeVisible();
}

async function _keyboardRestriction(page: Page): Promise<void> {
  await _tabTo({
    page: page,
    locator: page.getByRole("radio", { name: "Everyone", exact: true }),
  });
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "Only", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeDisabled();
  const picker = page.getByRole("combobox", {
    name: "Only these",
    exact: true,
  });
  await _tabTo({ page: page, locator: picker });
  await expect(picker).toBeFocused();
  await page.keyboard.type("grandparents");
  await expect(picker).toHaveValue("grandparents");
  await expect(
    page.getByRole("option", { name: /The grandparents/ }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("The grandparents", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press(_keyboardTab({ page: page }));
  await expect(
    page.getByRole("button", { name: "Put 1 up", exact: true }),
  ).toBeEnabled();
}

async function _installKeyboardContracts(
  options: Readonly<KeyboardContractOptions>,
): Promise<void> {
  const { page, detail } = options;
  await page.route("**/api/upload-sessions/**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: detail });
    } else {
      await route.continue();
    }
  });
  await _installKeyboardOccasionContract(options);
  await page.route("**/api/members", (route) => {
    return route.fulfill({
      json: { shape: "directory", members: [], nextCursor: null },
    });
  });
  await page.route("**/api/groups", (route) => {
    return route.fulfill({
      json: {
        shape: "picker",
        groups: [{ groupId: KEYBOARD_GROUP_ID, name: "The grandparents" }],
        nextCursor: null,
      },
    });
  });
  await _installKeyboardCommitContract(options);
}

async function _installKeyboardOccasionContract({
  page,
  detail,
  writes,
}: Readonly<KeyboardContractOptions>): Promise<void> {
  const occasion = {
    milestoneId: KEYBOARD_OCCASION_ID,
    name: "Keyboard occasion",
    startsOn: detail.files[0]!.capturedOn!,
    endsOn: detail.files[0]!.capturedOn!,
    blurb: null,
  };
  await _installKeyboardOccasionDirectory({ page, detail, occasion });
  await page.route("**/api/upload-sessions/*/edits", async (route) => {
    const body = route.request().postDataJSON() as CreateUploadEditRequest;
    writes.push({ path: "edits", body });
    const edit = {
      editId: "018f0000-0000-7000-8000-000000009000",
      kind: "milestone" as const,
      label: occasion.name,
      tag: null,
      person: null,
      milestone: occasion,
      targetCount: 1,
      createdAt: detail.createdAt,
      undoneAt: null,
      appliedAt: null,
      canUndo: true,
    };
    detail.edits.push(edit);
    detail.days[0]!.milestones = [occasion];
    await route.fulfill({ status: 201, json: edit });
  });
}

function _expectKeyboardWrites({
  writes,
  detail,
}: Readonly<{ writes: KeyboardWrite[]; detail: UploadSessionDetail }>): void {
  expect(writes).toEqual([
    {
      path: "edits",
      body: {
        kind: "milestone",
        milestoneId: KEYBOARD_OCCASION_ID,
        targetFileIds: [detail.files[0]!.fileId],
      },
    },
    {
      path: "visibility",
      body: {
        mode: "only",
        subjects: [{ kind: "group", id: KEYBOARD_GROUP_ID }],
      },
    },
    { path: "commit", body: { intent: "arm" } },
  ]);
}

async function _installKeyboardCommitContract({
  page,
  detail,
  writes,
}: Readonly<KeyboardContractOptions>): Promise<void> {
  await page.route("**/api/upload-sessions/*/visibility", async (route) => {
    const body = route.request().postDataJSON() as {
      mode: "only";
      subjects: Array<{ kind: "group"; id: string }>;
    };
    writes.push({ path: "visibility", body });
    detail.visibility = {
      visibilityRuleId: "keyboard-only",
      mode: body.mode,
      label: "The grandparents",
      subjects: body.subjects.map((subject) => {
        return { ...subject, displayName: "The grandparents" };
      }),
    };
    await route.fulfill({ json: detail.visibility });
  });
  await page.route("**/api/upload-sessions/*/commit", async (route) => {
    writes.push({ path: "commit", body: route.request().postDataJSON() });
    await route.fulfill({ json: { ...detail, state: "uploading" } });
  });
  await page.route("**/api/upload-sessions/*/files/*/presign", () => {});
}

async function _installKeyboardOccasionDirectory({
  page,
  detail,
  occasion,
}: Readonly<{
  page: Page;
  detail: UploadSessionDetail;
  occasion: {
    milestoneId: string;
    name: string;
    startsOn: string;
    endsOn: string;
    blurb: null;
  };
}>): Promise<void> {
  await page.route("**/api/milestones**", (route) => {
    return route.fulfill({
      json: {
        milestones: [
          {
            milestone: occasion,
            itemCount: 0,
            dayCount: 1,
            canEdit: true,
            canDelete: true,
            mismatchCount: 0,
            createdBy: null,
            createdAt: detail.createdAt,
            updatedAt: detail.createdAt,
          },
        ],
        nextCursor: null,
      },
    });
  });
}
