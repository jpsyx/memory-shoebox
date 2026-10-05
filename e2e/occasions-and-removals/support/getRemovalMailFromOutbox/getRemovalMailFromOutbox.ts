import { removalResolvedEmailPayloadSchema } from "@memory-shoebox/shared";
import { createDatabase } from "../../../../apps/server/src/db/client.ts";
import { E2E_DATABASE_PATH } from "../../../support/e2eEnvironment.constants.ts";
import type { QueuedRemovalMail } from "./getRemovalMailFromOutbox.types.ts";
/**
 * Actual queued resolution mail, validated through shared frozen-payload
 * contracts.
 */
export async function getRemovalMailFromOutbox(
  options: Readonly<{
    address: string;
    itemId: string;
  }>,
): Promise<QueuedRemovalMail[]> {
  const database = createDatabase(E2E_DATABASE_PATH);
  try {
    const rows = await database
      .selectFrom("outbound_emails")
      .select(["payload_json", "state"])
      .where("to_address", "=", options.address)
      .where("kind", "=", "removal_resolved")
      .execute();
    return rows
      .filter((row) => {
        return row.payload_json.includes(options.itemId);
      })
      .map((row) => {
        return {
          state: row.state,
          payload: removalResolvedEmailPayloadSchema.parse(
            JSON.parse(row.payload_json),
          ),
        };
      });
  } finally {
    await database.destroy();
  }
}
