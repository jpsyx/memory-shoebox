import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import type { Database } from "../../../src/db/types.ts";
import { checkInvitationResendLimit } from "../../../src/http/rateLimit/invitationResend.ts";
import {
  NOW,
  insertInvitation,
  insertMember,
  insertOutboundEmail,
  shiftMinutes,
} from "../../helpers/seed.ts";

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

describe("checkInvitationResendLimit", () => {
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
});
