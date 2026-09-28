import { describe, expect, it } from "vitest";
import { getWeekIndexFromCreatedAt } from "../../src/jobs/getWeekIndexFromCreatedAt.ts";
import { makeRemovalReminderKeyFromRequest } from "../../src/jobs/makeRemovalReminderKeyFromRequest.ts";

describe("makeRemovalReminderKeyFromRequest", () => {
  it("is the recipe from notifications.md", () => {
    expect(
      makeRemovalReminderKeyFromRequest({
        requestId: "request-1",
        memberId: "member-2",
        weekIndex: 1,
      }),
    ).toBe("removal-reminder:request-1:member-2:1");
  });

  it("makes two reminders in one week arithmetically impossible", () => {
    const createdAt = "2026-09-14T09:00:00.000Z";
    const keyFor = (now: string) => {
      return makeRemovalReminderKeyFromRequest({
        requestId: "request-1",
        memberId: "member-2",
        weekIndex: getWeekIndexFromCreatedAt({
          createdAt,
          now,
          timezone: "UTC",
        }),
      });
    };

    // Every hour of one week produces one key, so the unique index on
    // outbound_emails.idempotency_key rejects all but the first.
    expect(keyFor("2026-09-21T09:00:00.000Z")).toBe(
      keyFor("2026-09-27T23:00:00.000Z"),
    );
    // The next week is a different key, so exactly one more goes out.
    expect(keyFor("2026-09-28T09:00:00.000Z")).not.toBe(
      keyFor("2026-09-27T23:00:00.000Z"),
    );
  });
});
