import { afterEach, describe, expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import {
  insertInstanceSetting,
  insertItem,
  insertMember,
} from "../helpers/seedHelpers/seedHelpers.ts";

let testApp: TestApp;
afterEach(async () => {
  await testApp?.close();
});

async function _readCountFromMarks(options: {
  timezone: string;
  now: string;
  firstSeenAt: string;
  openedAt?: string;
}): Promise<number> {
  const memberId = createId();
  testApp = await createTestApp({
    clock: () => {
      return new Date(options.now);
    },
    authenticate: async () => {
      return makeViewer({ memberId, isAdmin: true, role: "admin" });
    },
  });
  await insertMember(testApp.database, { id: memberId, role: "admin" });
  await insertInstanceSetting(testApp.database, {
    key: "shoebox.timezone",
    value: options.timezone,
  });
  const itemId = await insertItem(testApp.database, { uploadedBy: memberId });
  await testApp.database
    .insertInto("item_views")
    .values({
      id: createId(),
      member_id: memberId,
      item_id: itemId,
      first_seen_at: options.firstSeenAt,
      first_opened_at: options.openedAt ?? null,
      last_opened_at: options.openedAt ?? null,
      open_count: options.openedAt === undefined ? 0 : 1,
    })
    .execute();
  const response = await testApp.app.inject({ url: "/api/presence" });
  expect(response.statusCode).toBe(200);
  return response.json().presence[0].activeDaysCount;
}

describe("presence local date boundaries", () => {
  it("keeps both occurrences of Casey's midnight in one local date", async () => {
    expect(
      await _readCountFromMarks({
        timezone: "Antarctica/Casey",
        now: "2020-03-10T12:00:00.000Z",
        firstSeenAt: "2020-03-07T13:30:00.000Z",
        openedAt: "2020-03-07T17:30:00.000Z",
      }),
    ).toBe(1);
  });
  it("includes the first repeated midnight at the ninety-day window start", async () => {
    expect(
      await _readCountFromMarks({
        timezone: "Antarctica/Casey",
        now: "2020-06-05T12:00:00.000Z",
        firstSeenAt: "2020-03-07T13:30:00.000Z",
      }),
    ).toBe(1);
  });
  it("begins a midnight-gap date at its first existing clock time", async () => {
    expect(
      await _readCountFromMarks({
        timezone: "America/Santiago",
        now: "2026-09-07T12:00:00.000Z",
        firstSeenAt: "2026-09-06T03:59:59.999Z",
        openedAt: "2026-09-06T04:00:00.000Z",
      }),
    ).toBe(2);
  });
  it.each([
    ["2026-09-06T03:59:59.999Z", 0],
    ["2026-09-06T04:00:00.000Z", 1],
  ])(
    "uses the first existing midnight-gap instant at the window edge: %s",
    async (firstSeenAt, expected) => {
      expect(
        await _readCountFromMarks({
          timezone: "America/Santiago",
          now: "2026-12-04T12:00:00.000Z",
          firstSeenAt,
        }),
      ).toBe(expected);
    },
  );
  it.each([
    ["Antarctica/Casey", "2020-03-08", "2020-03-07T13:00:00.000Z"],
    ["America/Santiago", "2026-09-06", "2026-09-06T04:00:00.000Z"],
    ["America/New_York", "2026-03-08", "2026-03-08T05:00:00.000Z"],
    ["America/New_York", "2026-11-01", "2026-11-01T04:00:00.000Z"],
  ])(
    "finds the earliest date boundary in %s on %s",
    async (timezone, localDate, expected) => {
      const { getPresenceDayStartFromLocalDate } =
        await import("../../src/observation/getPresenceDayStartFromLocalDate.ts");
      expect(getPresenceDayStartFromLocalDate({ timezone, localDate })).toBe(
        expected,
      );
    },
  );
});
