import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import type { RateLimitWindow } from "../../../src/http/rateLimit/createFixedWindowLimiter.ts";
import { checkInvitationResendLimit } from "../../../src/http/rateLimit/checkInvitationResendLimit.ts";
import {
  NOW,
  insertInvitation,
  insertMember,
  insertOutboundEmail,
  shiftMinutes,
} from "../../helpers/seedHelpers.ts";

async function createDatabaseWithInvitation(
  invitationOverrides: Partial<Database["invitations"]> = {},
) {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const adminId = await insertMember(database, { role: "admin" });
  const invitedId = await insertMember(database, { status: "invited" });
  const invitationId = await insertInvitation(database, {
    memberId: invitedId,
    invitedByMemberId: adminId,
    ...invitationOverrides,
  });
  return { database, invitationId, invitedId };
}

/**
 * Imports the limiter against a rule table this test writes.
 *
 * The point is to tell what the function enforces apart from what
 * `rules.ts` happens to declare today: with both at one a minute and ten a
 * day, a private copy of those numbers and a reading of the table behave
 * identically. Under a table this test controls, they do not.
 *
 * The windows are handed over longest first, so that a reading which trusted
 * the declared order rather than the lengths would get the two halves the
 * wrong way round.
 */
async function importCheckWithWindows(
  windows: RateLimitWindow[],
): Promise<typeof checkInvitationResendLimit> {
  vi.resetModules();
  vi.doMock("../../../src/http/rateLimit/rateLimit.constants.ts", () => {
    return {
      RATE_LIMIT_RULES: {
        invitationResendPerInvitation: { scope: "invitation", windows },
      },
    };
  });
  const moduleUnderTest =
    await import("../../../src/http/rateLimit/checkInvitationResendLimit.ts");
  return moduleUnderTest.checkInvitationResendLimit;
}

/** Two minutes and three a day: neither number is the real table's. */
const TEST_WINDOWS: RateLimitWindow[] = [
  { limit: 3, windowSeconds: 86_400 },
  { limit: 1, windowSeconds: 120 },
];

describe("checkInvitationResendLimit", () => {
  afterEach(() => {
    vi.doUnmock("../../../src/http/rateLimit/rateLimit.constants.ts");
    vi.resetModules();
  });

  it("refuses a second send inside the minute, and says how long is left", async () => {
    const { database, invitedId } = await createDatabaseWithInvitation({
      last_sent_at: shiftMinutes(NOW, -0.25),
    });

    const outcome = await checkInvitationResendLimit({
      database,
      memberId: invitedId,
      now: NOW,
    });

    expect(outcome.isAllowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBe(45);
    await database.destroy();
  });

  it("allows one a minute later", async () => {
    const { database, invitedId } = await createDatabaseWithInvitation({
      last_sent_at: shiftMinutes(NOW, -2),
    });

    const outcome = await checkInvitationResendLimit({
      database,
      memberId: invitedId,
      now: NOW,
    });

    expect(outcome.isAllowed).toBe(true);
    await database.destroy();
  });

  it("refuses the eleventh in a day", async () => {
    const { database, invitationId, invitedId } =
      await createDatabaseWithInvitation({
        last_sent_at: shiftMinutes(NOW, -10),
      });
    for (let sendCount = 1; sendCount <= 10; sendCount += 1) {
      await insertOutboundEmail(database, {
        kind: "invitation",
        trigger_kind: "invitation",
        trigger_id: invitationId,
        idempotency_key: `invite:${invitationId}:${sendCount}`,
        created_at: shiftMinutes(NOW, -60 * sendCount),
      });
    }

    const outcome = await checkInvitationResendLimit({
      database,
      memberId: invitedId,
      now: NOW,
    });

    expect(outcome.isAllowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
    await database.destroy();
  });

  it("reads the latest of several invitations, which uuidv7 ids order", async () => {
    const { database, invitedId } = await createDatabaseWithInvitation({
      last_sent_at: shiftMinutes(NOW, -90),
    });
    const adminId = await insertMember(database, { role: "admin" });
    await insertInvitation(database, {
      memberId: invitedId,
      invitedByMemberId: adminId,
      last_sent_at: shiftMinutes(NOW, -0.5),
    });

    const outcome = await checkInvitationResendLimit({
      database,
      memberId: invitedId,
      now: NOW,
    });

    // The older invitation would have allowed it; the latest one refuses.
    expect(outcome.isAllowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBe(30);
    await database.destroy();
  });

  it("allows when the member has no invitation, leaving the 404 to the route", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);

    const outcome = await checkInvitationResendLimit({
      database,
      memberId,
      now: NOW,
    });

    expect(outcome.isAllowed).toBe(true);
    await database.destroy();
  });

  it("reads the length of the minute window from the rule table", async () => {
    const check = await importCheckWithWindows(TEST_WINDOWS);
    const { database, invitedId } = await createDatabaseWithInvitation({
      last_sent_at: shiftMinutes(NOW, -1.5),
    });

    const outcome = await check({ database, memberId: invitedId, now: NOW });

    // Ninety seconds is outside a minute and inside the two the table here
    // declares. A copy of sixty in invitationResend.ts would allow this.
    expect(outcome.isAllowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBe(30);
    await database.destroy();
  });

  it("reads the day window's allowance from the rule table", async () => {
    const check = await importCheckWithWindows(TEST_WINDOWS);
    const { database, invitationId, invitedId } =
      await createDatabaseWithInvitation({
        last_sent_at: shiftMinutes(NOW, -10),
      });
    for (let sendCount = 1; sendCount <= 3; sendCount += 1) {
      await insertOutboundEmail(database, {
        kind: "invitation",
        trigger_kind: "invitation",
        trigger_id: invitationId,
        idempotency_key: `invite:${invitationId}:${sendCount}`,
        created_at: shiftMinutes(NOW, -60 * sendCount),
      });
    }

    const outcome = await check({ database, memberId: invitedId, now: NOW });

    // Three sends fill an allowance of three and leave seven of the real
    // table's ten, so only a function reading the table refuses this one.
    expect(outcome.isAllowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
    await database.destroy();
  });
});
