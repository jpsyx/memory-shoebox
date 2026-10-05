import { expect, it } from "vitest";
import {
  getSetupRedirectFromNavigation,
  type SetupNavigationState,
} from "./getSetupRedirectFromNavigation";
import { createMeResponse } from "@/testing/createMeResponse";
const BASE = {
  isRequired: false,
  me: undefined,
  needsInvitations: false,
  pathname: "/items/abc",
  attemptedUrl: "/items/abc?x=1",
} as const satisfies SetupNavigationState;
it("sends cold deep loads to setup before any authentication", () => {
  expect(getSetupRedirectFromNavigation({ ...BASE, isRequired: true })).toEqual(
    { to: "/setup" },
  );
  expect(
    getSetupRedirectFromNavigation({
      ...BASE,
      isRequired: true,
      pathname: "/setup",
    }),
  ).toBeUndefined();
});
it("preserves initialized anonymous deep links but allows sign-in and join", () => {
  expect(getSetupRedirectFromNavigation(BASE)).toEqual({
    to: "/sign-in",
    redirect: BASE.attemptedUrl,
  });
  expect(
    getSetupRedirectFromNavigation({ ...BASE, pathname: "/sign-in" }),
  ).toBeUndefined();
  expect(
    getSetupRedirectFromNavigation({ ...BASE, pathname: "/join" }),
  ).toBeUndefined();
  expect(
    getSetupRedirectFromNavigation({ ...BASE, pathname: "/setup" }),
  ).toEqual({ to: "/sign-in" });
});
it("resumes only pending admins and protects the invitation path", () => {
  const me = createMeResponse();
  expect(
    getSetupRedirectFromNavigation({ ...BASE, me, needsInvitations: true }),
  ).toEqual({ to: "/setup/invite" });
  expect(
    getSetupRedirectFromNavigation({
      ...BASE,
      me,
      needsInvitations: true,
      pathname: "/setup/invite",
    }),
  ).toBeUndefined();
  expect(
    getSetupRedirectFromNavigation({ ...BASE, me, pathname: "/setup/invite" }),
  ).toBeUndefined();
  expect(
    getSetupRedirectFromNavigation({
      ...BASE,
      me: createMeResponse({ role: "viewer" }),
      needsInvitations: true,
      pathname: "/setup/invite",
    }),
  ).toEqual({ to: "/" });
  expect(
    getSetupRedirectFromNavigation({ ...BASE, me, pathname: "/setup" }),
  ).toEqual({ to: "/" });
});
