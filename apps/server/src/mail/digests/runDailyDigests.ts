import type { Kysely } from "kysely";
import type { Database } from "../../db/types/db.types.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import { getDigestWindowFromInstant } from "./getDigestWindowFromInstant.ts";
import { prepareDailyDigest } from "./prepareDailyDigest.ts";

/** Pages recipients while each unique member/date batch owns its own transaction. */
export async function runDailyDigests(
  options: Readonly<{ database: Kysely<Database>; now: string }>,
): Promise<{ preparedCount: number; emptyCount: number }> {
  const settings = await readInstanceSettings({
    database: options.database,
    keys: ["shoebox.timezone"],
  });
  let preparedCount = 0;
  let emptyCount = 0;
  if (
    !getDigestWindowFromInstant({
      now: options.now,
      timezone: settings["shoebox.timezone"],
    })
  ) {
    return { preparedCount, emptyCount };
  }
  let cursor = "";
  while (true) {
    const recipients = await options.database
      .selectFrom("notification_digest_events")
      .select("member_id")
      .distinct()
      .where("state", "=", "pending")
      .where("member_id", ">", cursor)
      .orderBy("member_id")
      .limit(50)
      .execute();
    for (const recipient of recipients) {
      const result = await prepareDailyDigest({
        ...options,
        memberId: recipient.member_id,
      });
      if (result === "prepared") {
        preparedCount += 1;
      }
      if (result === "empty") {
        emptyCount += 1;
      }
    }
    if (recipients.length < 50) {
      return { preparedCount, emptyCount };
    }
    cursor = recipients.at(-1)!.member_id;
  }
}
