import { describe, expect, it } from "vitest";
import {
  EMAIL_RENDERERS,
  EMAIL_TEMPLATES,
} from "../../src/mail/templates/emailTemplates.constants.ts";

describe("removal mail registry", () => {
  it.each(["removal_request", "removal_reminder", "removal_resolved"])(
    "registers %s and validates stored JSON",
    async (kind) => {
      expect(EMAIL_TEMPLATES).toHaveProperty(kind);
      expect(EMAIL_RENDERERS).toHaveProperty(kind);
      const renderer = Reflect.get(EMAIL_RENDERERS, kind) as (
        payload: unknown,
      ) => Promise<unknown>;
      await expect(renderer({})).rejects.toThrow();
    },
  );
});

import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { enqueueEmail } from "../../src/mail/enqueueEmail.ts";
import {
  insertInstanceSetting,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

it.each(["requester", "uploader"] as const)(
  "snapshots a truthful deleted %s preference footer",
  async (relation) => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    try {
      await insertInstanceSetting(database, {
        key: "public.base_url",
        value: "https://example.com",
      });
      await enqueueEmail({
        executor: database,
        now: NOW,
        input: {
          kind: "removal_resolved",
          toAddress: "member@example.com",
          toMemberId: undefined,
          toDisplayName: "Andrés",
          idempotencyKey: `answer:${relation}`,
          triggerKind: "removal_request",
          triggerId: "request-1",
          payload: {
            outcome: "deleted",
            relation,
            resolvedByDisplayName: "Papá",
            resolvedAt: NOW,
            itemCapturedOn: "2026-09-14",
          },
        },
      });
      const row = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .executeTakeFirstOrThrow();
      expect(row.subject).toBe("That photo has come down");
      expect(JSON.parse(row.payload_json).preferencesUrl).toBe(
        relation === "requester" ? null : "https://example.com/account",
      );
      const rendered = await EMAIL_RENDERERS.removal_resolved(
        JSON.parse(row.payload_json),
      );
      expect(rendered.text.includes("Turn these emails off")).toBe(
        relation === "uploader",
      );
    } finally {
      await database.destroy();
    }
  },
);
