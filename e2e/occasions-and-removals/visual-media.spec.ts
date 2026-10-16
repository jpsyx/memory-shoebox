import { test, expect } from "./asking-occasions.fixtures.ts";
import { showControlledVisualState } from "./support/visualStateHelpers/showControlledVisualState.ts";
import { waitForControlledVisualMedia } from "./support/controlledVisualMediaHelpers.ts";

const THUMBNAIL = "https://visual-media.invalid/highChair-thumb.jpg";

test("controlled capture waits for actual admitted thumbnail response and decode", async ({
  adminPage: page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await showControlledVisualState({
    page,
    surface: "milestones",
    state: "attach",
    scheme: "light",
  });
  let release!: () => void;
  let arrived!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const requested = new Promise<void>((done) => {
    arrived = done;
  });
  await page.route(THUMBNAIL, async (route) => {
    arrived();
    await held;
    await route.fallback();
  });
  await page.reload();
  const image = page.getByRole("img", { name: "Family at home", exact: true });
  await expect(image).toHaveCount(1);
  await requested;
  await expect(image).toHaveAttribute("src", THUMBNAIL);
  expect(
    await image.evaluate((node) => {
      return (node as HTMLImageElement).naturalWidth;
    }),
  ).toBe(0);
  let finished = false;
  const readiness = waitForControlledVisualMedia({ page, imageCount: 1 }).then(
    (value) => {
      finished = true;
      return value;
    },
  );
  await page.evaluate(() => {
    return new Promise<void>((done) => {
      requestAnimationFrame(() => {
        done();
      });
    });
  });
  expect(finished).toBe(false);
  release();
  expect(await readiness).toMatchObject([
    {
      alt: "Family at home",
      source: THUMBNAIL,
      isIntersecting: true,
      decoded: true,
      owner: "BUTTON",
    },
  ]);
});

test("controlled capture retains a nonintersecting source and rejects failed admitted media", async ({
  adminPage: page,
}) => {
  await page.setViewportSize({ width: 400, height: 900 });
  await showControlledVisualState({
    page,
    surface: "removal-requests",
    state: "open",
    scheme: "light",
  });
  const state = await waitForControlledVisualMedia({ page, imageCount: 2 });
  expect(state).toMatchObject([
    {
      alt: "Family at home",
      source: THUMBNAIL,
      isIntersecting: true,
      decoded: true,
    },
    {
      alt: "Family at home",
      source: null,
      currentSource: "",
      isIntersecting: false,
      decoded: false,
    },
  ]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await showControlledVisualState({
    page,
    surface: "milestones",
    state: "attach",
    scheme: "light",
  });
  await page.route(THUMBNAIL, (route) => {
    return route.abort();
  });
  const failed = page.waitForEvent("requestfailed", (request) => {
    return request.url() === THUMBNAIL;
  });
  await page.reload();
  await failed;
  await expect(
    page.getByRole("button", {
      name: "Unavailable photograph: Family at home",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
  await expect(
    waitForControlledVisualMedia({ page, imageCount: 1 }),
  ).rejects.toThrow();
});

test("controlled roles agree with current navigation bootstrap and account shell", async ({
  adminPage: page,
}) => {
  for (const [state, role] of [
    ["ask", "viewer"],
    ["admin", "admin"],
  ] as const) {
    const response = page.waitForResponse((candidate) => {
      return new URL(candidate.url()).pathname === "/api/bootstrap";
    });
    await showControlledVisualState({
      page,
      surface: "removal",
      state,
      scheme: "light",
    });
    const bootstrap = await (await response).json();
    expect(bootstrap.account.me.role).toBe(role);
    expect(bootstrap.setup.isRequired).toBe(false);
    expect(bootstrap.progress === null).toBe(role !== "admin");
    const current = await page.evaluate(async () => {
      return (await fetch("/api/me")).json();
    });
    expect(current).toEqual(bootstrap.account);
    await expect(
      page.getByRole("heading", {
        name: "Ask for this one to come down.",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/account");
    const administration = page.getByRole("heading", {
      name: "You run this archive",
      exact: true,
    });
    if (role === "admin") {
      await expect(administration).toBeVisible();
    } else {
      await expect(administration).toHaveCount(0);
    }
  }
});
