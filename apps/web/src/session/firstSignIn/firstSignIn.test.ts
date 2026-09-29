import { beforeEach, describe, expect, it } from "vitest";
import {
  setFirstSignIn,
  takeFirstSignIn,
} from "@/session/firstSignIn/firstSignIn";

beforeEach(() => {
  takeFirstSignIn();
});

describe("the first sign-in flag", () => {
  it("is not set by default", () => {
    expect(takeFirstSignIn()).toBe(false);
  });

  it("is readable exactly once", () => {
    setFirstSignIn(true);

    expect(takeFirstSignIn()).toBe(true);
    expect(takeFirstSignIn()).toBe(false);
  });

  it("stays unset when somebody has signed in before", () => {
    setFirstSignIn(false);

    expect(takeFirstSignIn()).toBe(false);
  });
});
