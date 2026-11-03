import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  ADMIN,
  countCallsTo,
  getBodiesFromRecordedRequests,
  renderAccount,
  respondLikeAServer,
  respondWith,
} from "./accountSurfaceTestHelpers";

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("surface 9", () => {
  it("saves a name with one PATCH carrying only the name", async () => {
    const user = userEvent.setup();
    respondWith({
      "PATCH /api/me": {
        body: createMeResponse({ displayName: "Abuela" }),
        status: 200,
      },
    });
    renderAccount();

    const field = await screen.findByLabelText("Your name");
    await user.clear(field);
    await user.type(field, "Abuela");
    await user.click(screen.getByRole("button", { name: "Save your name" }));

    await waitFor(() => {
      expect(
        getBodiesFromRecordedRequests({ method: "PATCH", path: "/api/me" }),
      ).toEqual([{ displayName: "Abuela" }]);
    });
    expect(await screen.findByText("Name saved.")).toBeVisible();
  });

  it("saves a switch with one PATCH carrying all five booleans", async () => {
    const user = userEvent.setup();
    respondWith();
    renderAccount();

    await user.selectOptions(
      await screen.findByLabelText("New photos/videos"),
      "off",
    );

    await waitFor(() => {
      expect(
        getBodiesFromRecordedRequests({ method: "PATCH", path: "/api/me" }),
      ).toEqual([
        {
          notify: {
            onUpload: "off" as const,
            onComment: "daily" as const,

            onRemoval: true,
            onCommentTag: "immediate" as const,
          },
        },
      ]);
    });
  });

  // Decision 4: a switch moves when it is flipped, not when the server
  // answers. `EmailSheet` reads `checked` straight off its prop and holds no
  // state, so only an optimistic cache write can make this true.
  it("moves the switch before the server has answered", async () => {
    const user = userEvent.setup();
    let letThePatchLand = (): void => {};
    respondWith({
      "PATCH /api/me": {
        body: ADMIN,
        status: 200,
        waitFor: new Promise<void>((settle) => {
          letThePatchLand = settle;
        }),
      },
    });
    renderAccount();

    const aSwitch = await screen.findByLabelText("New photos/videos");
    expect(aSwitch).toHaveValue("daily");
    await user.selectOptions(aSwitch, "off");

    expect(aSwitch).toHaveValue("off");
    letThePatchLand();
  });

  it("puts the switch back when the save fails, and says so", async () => {
    const user = userEvent.setup();
    respondWith({
      "PATCH /api/me": {
        body: { error: "internal_error", message: "Something broke." },
        status: 500,
      },
    });
    renderAccount();

    const aSwitch = await screen.findByLabelText("New photos/videos");
    await user.selectOptions(aSwitch, "off");

    expect(
      await screen.findByText("That did not save. Try again."),
    ).toBeVisible();
    expect(aSwitch).toHaveValue("daily");
  });

  // Every answer to `PATCH /api/me` is the whole `MeResponse`, so two saves
  // in flight together can each put the other's field back: whichever
  // response lands last wins, and `staleTime: Infinity` means nothing ever
  // refetches to correct it. `scope: { id: "me" }` removes the race by
  // serialising the two requests, so the second is sent only once the first
  // has been applied and its answer therefore carries both changes.
  it("does not let one save revert the other's field", async () => {
    const user = userEvent.setup();
    const server = respondLikeAServer();
    renderAccount();

    const field = await screen.findByLabelText("Your name");
    await user.clear(field);
    await user.type(field, "Abuela");
    await user.click(screen.getByRole("button", { name: "Save your name" }));
    await user.selectOptions(screen.getByLabelText("New photos/videos"), "off");

    // Out of order, which is the whole point: the switch's answer is
    // released first, before the name save it was started after.
    server.letTheSwitchSaveLand();
    server.letTheNameSaveLand();

    // Both saves have finished: the name shows its confirmation, which only
    // a settled name save can produce, and the switches are live again,
    // which only a settled switch save can produce. Asserting before both
    // have landed would pass on the losing answer on its way past.
    expect(await screen.findByText("Name saved.")).toBeVisible();
    await waitFor(() => {
      expect(screen.getByLabelText("New photos/videos")).toBeEnabled();
    });

    expect(countCallsTo({ method: "PATCH", path: "/api/me" })).toBe(2);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Abuela, in My Shoebox.",
    );
    expect(screen.getByLabelText("New photos/videos")).toHaveValue("off");
  });
});
