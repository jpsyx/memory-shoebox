import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_DOORS,
  renderAccount,
  respondWith,
  VIEWER,
} from "./AccountSurface.fixtures";

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("surface 9", () => {
  it("names the member and the Shoebox", async () => {
    respondWith();
    renderAccount();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Papá, in My Shoebox.",
      }),
    ).toBeVisible();
  });

  it("opens the five admin doors for an admin", async () => {
    respondWith();
    renderAccount();

    await screen.findByRole("heading", { name: "You run this archive" });
    ADMIN_DOORS.forEach((door) => {
      expect(screen.getByRole("link", { name: door })).toBeVisible();
    });
  });

  it("shows a viewer no admin doors at all", async () => {
    respondWith({ "GET /api/me": { body: VIEWER, status: 200 } });
    renderAccount();

    await screen.findByRole("heading", { name: "Where you are signed in" });
    ADMIN_DOORS.forEach((door) => {
      expect(screen.queryByRole("link", { name: door })).toBeNull();
    });
  });

  it("says which version is running, beside the source link", async () => {
    respondWith();
    renderAccount();

    expect(
      await screen.findByRole("link", { name: "Get the source" }),
    ).toHaveAttribute("href", "https://github.com/jpsyx/memory-shoebox");
    expect(
      await screen.findByText("You are running version 0.0.0."),
    ).toBeVisible();
  });
});
