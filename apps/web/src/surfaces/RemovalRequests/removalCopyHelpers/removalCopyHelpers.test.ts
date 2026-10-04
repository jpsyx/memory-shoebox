import { describe, expect, it } from "vitest";
import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtures";
import {
  getItemHrefFromRemovalRequest,
  removalStateLabel,
  removalWriteFailure,
} from "./removalCopyHelpers";

describe("request copy and visible addresses", () => {
  it("names every settled outcome without rewriting an answer", () => {
    expect(
      ["deleted", "declined", "withdrawn"].map((state) => {
        return removalStateLabel(state as "deleted" | "declined" | "withdrawn");
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
