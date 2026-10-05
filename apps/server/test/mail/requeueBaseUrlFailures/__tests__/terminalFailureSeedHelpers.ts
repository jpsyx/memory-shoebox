import type { DatabaseExecutor } from "../../../../src/db/types/db.types.ts";
import { insertOutboundEmail } from "../../../helpers/seedHelpers/seedHelpers.ts";
import type {
  TerminalCommentFailureOptions,
  TerminalMailFailuresResult,
} from "./requeueFixtures.types.ts";

/** Returns email overrides for failures that must remain terminal. */
export function makeTerminalOverridesFromFixture(
  options: Readonly<
    Pick<TerminalMailFailuresResult, "atBoundary" | "payload" | "itemId">
  >,
): Array<NonNullable<Parameters<typeof insertOutboundEmail>[1]>> {
  const { atBoundary, payload, itemId } = options;
  return [
    { created_at: atBoundary },
    { last_error_code: "provider_refused" },
    { trigger_id: "deleted" },
    { payload_json: "{}" },
    {
      payload_json: JSON.stringify({
        ...COMMON,
        ...payload,
        itemUrl: `javascript:/item/${itemId}`,
      }),
    },
    {
      payload_json: JSON.stringify({
        ...COMMON,
        ...payload,
        baseUrl: "invalid",
      }),
    },
    {
      payload_json: JSON.stringify({
        ...COMMON,
        ...payload,
        preferencesUrl: "invalid",
      }),
    },
    { payload_json: "{invalid" },
    { payload_json: JSON.stringify({ ...COMMON, ...payload, body: 9 }) },
    {
      payload_json: JSON.stringify({ ...COMMON, ...payload, itemUrl: null }),
    },
  ];
}

/** Inserts terminal comment failures and returns their email IDs. */
export async function insertTerminalCommentFailures(
  options: Readonly<TerminalCommentFailureOptions>,
): Promise<string[]> {
  const { context, commentId, payload, overridesList } = options;
  const terminal: string[] = [];
  for (const overrides of overridesList) {
    terminal.push(
      await insertFailure({
        context,
        kind: "comment",
        triggerKind: "comment",
        triggerId: commentId,
        payload,
        overrides,
      }),
    );
  }
  return terminal;
}

/** Inserts failed sign-in-code emails and returns their IDs. */
export async function insertTerminalSignInCodes(
  database: DatabaseExecutor,
): Promise<string[]> {
  const terminal: string[] = [];
  terminal.push(
    await insertOutboundEmail(database, {
      state: "failed",
      last_error_code: "base_url_unset",
      payload_json: "{}",
      subject: "Your code",
    }),
  );
  terminal.push(
    await insertOutboundEmail(database, {
      state: "failed",
      last_error_code: "base_url_unset",
      payload_json: JSON.stringify({
        ...COMMON,
        code: "123456",
        expiresAt: "2026-09-20T10:00:00.000Z",
        expiresInMinutes: 10,
      }),
    }),
  );
  return terminal;
}

import { COMMON, insertFailure } from "./requeueBaseUrlFailuresTestHelpers.ts";
