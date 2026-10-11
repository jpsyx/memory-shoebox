import type { SelectQueryBuilder } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import { expect, it, vi } from "vitest";
import type {
  EmailSendRequest,
  EmailService,
} from "../../../src/mail/EmailService/EmailService.types.ts";
import { MailSendError } from "../../../src/mail/MailSendError.ts";
import { runMailQueueOnce } from "../../../src/mail/runMailQueueOnce.ts";
import { NOW, shiftMinutes } from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMailContext,
  queueSignInCode,
} from "./runMailQueueOnceTestHelpers.ts";

function _makeSelectionBarrier() {
  const selected = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  return { selected, resume };
}

it("reuses the persisted sender when overlapping passes selected an unfrozen row", async () => {
  const { database } = await createMailContext();
  const firstSelection = _makeSelectionBarrier();
  const delayedSelection = _makeSelectionBarrier();
  const prototype = Object.getPrototypeOf(
    database.selectFrom("outbound_emails"),
  ) as SelectQueryBuilder<
    Database,
    "outbound_emails",
    Database["outbound_emails"]
  >;
  const execute = prototype.execute;
  let selectionCount = 0;
  const selectionSpy = vi
    .spyOn(prototype, "execute")
    .mockImplementation(async function (this: typeof prototype) {
      const rows = await execute.call(this);
      if (rows[0]?.state === "queued" && rows[0]?.idempotency_key) {
        const barrier = [firstSelection, delayedSelection][selectionCount++];
        if (barrier) {
          barrier.selected.resolve();
          await barrier.resume.promise;
        }
      }
      return rows;
    });
  try {
    await queueSignInCode(database);
    const requests: EmailSendRequest[] = [];
    const sender: EmailService = {
      send: async (request) => {
        requests.push(request);
        if (requests.length === 1) {
          throw new MailSendError({
            code: "network_error",
            message: "Accepted, but response lost",
          });
        }
        if (JSON.stringify(requests[0]) !== JSON.stringify(request)) {
          throw new MailSendError({
            code: "invalid_idempotent_request",
            message: "Changed request under accepted key",
          });
        }
        return { providerMessageId: "accepted-first-request" };
      },
    };
    const firstPass = runMailQueueOnce({ database, sender, now: NOW });
    await firstSelection.selected.promise;
    await database
      .updateTable("settings")
      .set({ value: JSON.stringify("New Sender") })
      .where("key", "=", "mail.from_name")
      .execute();
    const delayedPass = runMailQueueOnce({
      database,
      sender,
      now: shiftMinutes({ instant: NOW, minutes: 1 }),
    });
    await delayedSelection.selected.promise;
    firstSelection.resume.resolve();
    expect((await firstPass).failedCount).toBe(1);
    const firstSnapshot = await database
      .selectFrom("outbound_emails")
      .select("sender_snapshot_json")
      .executeTakeFirstOrThrow();
    delayedSelection.resume.resolve();
    const result = await delayedPass;
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[1]?.from).toBe("My Shoebox <shoebox@example.com>");
    expect(result.sentCount).toBe(1);
    const delivered = await database
      .selectFrom("outbound_emails")
      .select(["state", "provider_message_id", "sender_snapshot_json"])
      .executeTakeFirstOrThrow();
    expect(delivered).toEqual({
      state: "sent",
      provider_message_id: "accepted-first-request",
      sender_snapshot_json: firstSnapshot.sender_snapshot_json,
    });
  } finally {
    firstSelection.resume.resolve();
    delayedSelection.resume.resolve();
    selectionSpy.mockRestore();
    await database.destroy();
  }
});
