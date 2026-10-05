import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { REMOVAL_REQUEST_STATES } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import {
  getItemHrefFromRemovalRequest,
  removalStateLabel,
  removalWriteFailure,
} from "./removalCopyHelpers";
describe("request copy and visible addresses", () => {
  it("returns Deleted, Kept and Withdrawn labels for settled outcomes", () => {
    expect(
      REMOVAL_REQUEST_STATES.filter((state) => {
        return state !== "open";
      }).map((state) => {
        return removalStateLabel(state);
      }),
    ).toEqual(["Deleted", "Kept", "Withdrawn"]);
  });
  it("creates no address from null identity even if old media exists", () => {
    expect(
      getItemHrefFromRemovalRequest(
        makeRemovalRequestFromOverrides({ itemId: null }),
      ),
    ).toBeUndefined();
  });
  it("uses stable review guidance for a lost response", () => {
    expect(removalWriteFailure(new TypeError("private detail"))).toMatch(
      /refreshed request/,
    );
  });
});
