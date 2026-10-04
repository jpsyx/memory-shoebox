import type { Database } from "../../src/db/types/db.types.ts";
import type { Selectable } from "kysely";
import { describe, expect, it } from "vitest";
import { EMAIL_RENDERERS } from "../../src/mail/templates/emailTemplates.constants.ts";

async function _snapshotsATruthfulDeletedSPreferenceFooter1Stage1(
  state: Readonly<SnapshotsATruthfulDeletedSPreferenceFooter1State0>,
): Promise<SnapshotsATruthfulDeletedSPreferenceFooter1State1> {
  const { database } = state;
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://example.com",
  });
  return { ...state };
}

async function _snapshotsATruthfulDeletedSPreferenceFooter1Stage2(
  state: Readonly<SnapshotsATruthfulDeletedSPreferenceFooter1State1>,
): Promise<SnapshotsATruthfulDeletedSPreferenceFooter1State2> {
  const { database, relation } = state;
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
  return { ...state };
}

async function _snapshotsATruthfulDeletedSPreferenceFooter1Stage3(
  state: Readonly<SnapshotsATruthfulDeletedSPreferenceFooter1State2>,
): Promise<SnapshotsATruthfulDeletedSPreferenceFooter1State3> {
  const { database, relation } = state;
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
  return { ...state, row, rendered };
}
describe("removal mail registry", () => {
  it.each(["removal_request", "removal_reminder", "removal_resolved"])(
    "rejects malformed stored JSON for %s",
    async (kind) => {
      const renderer = Reflect.get(EMAIL_RENDERERS, kind) as (
        payload: unknown,
      ) => Promise<unknown>;
      await expect(renderer({})).rejects.toThrow();
    },
  );
});

import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { enqueueEmail } from "../../src/mail/enqueueEmail/enqueueEmail.ts";
import {
  insertInstanceSetting,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

type SnapshotsATruthfulDeletedSPreferenceFooter1State0 = {
  relation: "uploader" | "requester";
  database: ReturnType<typeof createDatabase>;
};
type SnapshotsATruthfulDeletedSPreferenceFooter1State1 =
  SnapshotsATruthfulDeletedSPreferenceFooter1State0;
type SnapshotsATruthfulDeletedSPreferenceFooter1State2 =
  SnapshotsATruthfulDeletedSPreferenceFooter1State1;
type SnapshotsATruthfulDeletedSPreferenceFooter1State3 =
  SnapshotsATruthfulDeletedSPreferenceFooter1State2 & {
    row: Selectable<Database["outbound_emails"]>;
    rendered: import(
      "../../../../packages/emails/dist/emailTemplate.types.ts",
      { with: { "resolution-mode": "import" } }
    ).RenderedEmail;
  };

it.each(["requester", "uploader"] as const)(
  "snapshots a truthful deleted %s preference footer",
  async (relation) => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    try {
      const state0 = { relation, database };
      const state1 =
        await _snapshotsATruthfulDeletedSPreferenceFooter1Stage1(state0);
      const state2 =
        await _snapshotsATruthfulDeletedSPreferenceFooter1Stage2(state1);
      await _snapshotsATruthfulDeletedSPreferenceFooter1Stage3(state2);
    } finally {
      await database.destroy();
    }
  },
);
