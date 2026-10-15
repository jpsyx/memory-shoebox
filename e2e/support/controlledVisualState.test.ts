import { expect, it, vi } from "vitest";
import type { Page, Route } from "@playwright/test";
import { createMeResponse } from "../../apps/web/src/testing/createMeResponse.ts";
import { showControlledVisualState } from "../occasions-and-removals/support/visualStateHelpers/showControlledVisualState.ts";

function pageFixture(
  baseline: unknown = {
    setup: { isRequired: false },
    account: createMeResponse(),
    progress: { needsInvitations: false },
  },
) {
  const handlers = new Map<string, (route: Route) => Promise<void>>();
  const reads = vi.fn(async (path: string) => {
    return {
      status: () => {
        return 200;
      },
      json: async () => {
        return path === "/api/bootstrap" ? baseline : createMeResponse();
      },
    };
  });
  const page = {
    request: { get: reads },
    unrouteAll: async () => {
      handlers.clear();
    },
    route: async (path: string, handler: (route: Route) => Promise<void>) => {
      handlers.set(path, handler);
    },
    emulateMedia: async () => {},
    addInitScript: async () => {},
    goto: vi.fn(async () => {}),
    locator: () => {
      return { waitFor: async () => {} };
    },
  } as unknown as Page;
  const answer = async (path: string) => {
    const fulfill = vi.fn();
    expect(handlers.has(path), `controlled ${path}`).toBe(true);
    await handlers.get(path)!({ fulfill } as unknown as Route);
    return fulfill.mock.calls[0]![0].json;
  };
  return { page, reads, answer };
}

it("keeps repeated controlled states on one actual bootstrap baseline and isolates each fresh page", async () => {
  const first = pageFixture();
  await showControlledVisualState({
    page: first.page,
    surface: "removal",
    state: "ask",
    scheme: "light",
  });
  const viewer = await first.answer("**/api/bootstrap");
  expect(viewer).toMatchObject({
    setup: { isRequired: false },
    account: { me: { role: "viewer" } },
    progress: null,
  });
  expect(await first.answer("**/api/me")).toEqual(viewer.account);
  await showControlledVisualState({
    page: first.page,
    surface: "removal",
    state: "admin",
    scheme: "dark",
  });
  const admin = await first.answer("**/api/bootstrap");
  expect(admin).toMatchObject({
    account: { me: { role: "admin" } },
    progress: { needsInvitations: false },
  });
  expect(await first.answer("**/api/me")).toEqual(admin.account);
  expect(first.reads.mock.calls).toEqual([["/api/bootstrap"]]);
  const second = pageFixture();
  await showControlledVisualState({
    page: second.page,
    surface: "removal",
    state: "ask",
    scheme: "light",
  });
  expect(second.reads.mock.calls).toEqual([["/api/bootstrap"]]);
});

it.each([
  { setup: { isRequired: true }, account: null, progress: null },
  { setup: { isRequired: false }, account: null, progress: null },
  {
    setup: { isRequired: false },
    account: { malformed: true },
    progress: null,
  },
])(
  "refuses an incomplete or invalid actual baseline before controlled navigation",
  async (baseline) => {
    const fixture = pageFixture(baseline);
    await expect(
      showControlledVisualState({
        page: fixture.page,
        surface: "removal",
        state: "ask",
        scheme: "light",
      }),
    ).rejects.toThrow();
    expect(fixture.page.goto).not.toHaveBeenCalled();
  },
);
