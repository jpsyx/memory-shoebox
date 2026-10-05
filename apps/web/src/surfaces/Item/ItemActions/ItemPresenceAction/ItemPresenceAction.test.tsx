import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import { ITEM_ID, makeItemDetail } from "@/testing/itemFixtureHelpers";
import { renderItem, respondWithItem } from "@/testing/itemHarnessHelpers";

describe("item presence action", () => {
  it.each(["admin", "viewer", "uploader"] as const)(
    "only offers %s the link when authorized",
    async (role) => {
      respondWithItem({
        detail: makeItemDetail(),
        routes: {
          "GET /api/me": { status: 200, body: createMeResponse({ role }) },
        },
      });
      renderItem(ITEM_ID);
      await screen.findByRole("link", { name: "Download the original" });
      const link = screen.queryByRole("link", { name: "Who opened this" });
      if (role === "admin") {
        expect(link).toHaveAttribute("href", `/presence?itemId=${ITEM_ID}`);
      } else {
        expect(link).toBeNull();
      }
    },
  );
});
