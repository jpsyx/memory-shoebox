import { describe, expect, it } from "vitest";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import { insertDrawableItem, makeApp } from "./timelineContractTestHelpers.ts";

describe("the latch and the day", () => {
  it("clears the accent dots the timeline reported", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertDrawableItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });

    const before = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(before.json().days[0].unseenCount).toBe(1);
    expect(before.json().days[0].items[0].isUnseen).toBe(true);

    await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [itemId] },
    });

    const after = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(after.json().days[0].unseenCount).toBe(0);
    expect(after.json().days[0].items[0].isUnseen).toBe(false);
    expect(after.json().days[0].itemCount).toBe(1);
    await close();
  });
});
