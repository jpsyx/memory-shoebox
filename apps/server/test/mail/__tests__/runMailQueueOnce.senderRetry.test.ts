import { expect, it } from "vitest";
import type {
  EmailSendRequest,
  EmailService,
} from "../../../src/mail/EmailService/EmailService.types.ts";
import { MailSendError } from "../../../src/mail/MailSendError.ts";
import { runMailQueueOnce } from "../../../src/mail/runMailQueueOnce.ts";
import {
  NOW,
  insertInstanceSetting,
  shiftMinutes,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMailContext,
  queueSignInCode,
} from "./runMailQueueOnceTestHelpers.ts";

it.each(["inherited name", "explicit sender"])(
  "reconciles ambiguous acceptance after changing %s with the same sender and key",
  async (change) => {
    const { database } = await createMailContext();
    try {
      await database
        .updateTable("settings")
        .set({ value: "null" })
        .where("key", "=", "mail.from_name")
        .execute();
      await queueSignInCode(database);
      const requests: EmailSendRequest[] = [];
      const accepted = new Map<string, EmailSendRequest>();
      const sender: EmailService = {
        send: async (request) => {
          requests.push(request);
          const previous = accepted.get(request.idempotencyKey);
          if (!previous) {
            accepted.set(request.idempotencyKey, request);
            throw new MailSendError({
              code: "network_error",
              message: "Accepted, but response lost",
            });
          }
          if (JSON.stringify(previous) !== JSON.stringify(request)) {
            throw new MailSendError({
              code: "invalid_idempotent_request",
              message: "Payload changed under the same key",
            });
          }
          return { providerMessageId: "accepted-before-response-loss" };
        },
      };
      await runMailQueueOnce({ database, sender, now: NOW });
      if (change === "inherited name") {
        await insertInstanceSetting(database, {
          key: "shoebox.name",
          value: "Renamed Family",
        });
      } else {
        await database
          .updateTable("settings")
          .set({ value: JSON.stringify("new@example.net") })
          .where("key", "=", "mail.from_address")
          .execute();
        await database
          .updateTable("settings")
          .set({ value: JSON.stringify("Custom Sender") })
          .where("key", "=", "mail.from_name")
          .execute();
      }
      const result = await runMailQueueOnce({
        database,
        sender,
        now: shiftMinutes({ instant: NOW, minutes: 1 }),
      });
      expect(requests[1]).toEqual(requests[0]);
      expect(requests[1]?.from).toBe("My Shoebox <shoebox@example.com>");
      expect(accepted.size).toBe(1);
      expect(result.sentCount).toBe(1);
      expect(
        await database
          .selectFrom("outbound_emails")
          .select(["state", "from_address", "provider_message_id"])
          .executeTakeFirst(),
      ).toEqual({
        state: "sent",
        from_address: "shoebox@example.com",
        provider_message_id: "accepted-before-response-loss",
      });
      await queueSignInCode(database);
      await runMailQueueOnce({
        database,
        sender,
        now: shiftMinutes({ instant: NOW, minutes: 2 }),
      });
      expect(requests[2]?.from).toBe(
        change === "inherited name"
          ? "Renamed Family <shoebox@example.com>"
          : "Custom Sender <new@example.net>",
      );
      expect(requests[2]?.idempotencyKey).not.toBe(requests[0]?.idempotencyKey);
    } finally {
      await database.destroy();
    }
  },
);
