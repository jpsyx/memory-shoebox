import type { UpdateObject } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { WorkerContext } from "./mailQueue.types.ts";

/** Writes one row's outcome. Every path out of a claim ends here. */
export async function finalizeQueuedEmail(
  options: Readonly<{
    context: WorkerContext;
    id: string;
    values: UpdateObject<Database, "outbound_emails">;
  }>,
): Promise<void> {
  await options.context.database
    .updateTable("outbound_emails")
    .set(options.values)
    .where("id", "=", options.id)
    .where((expression) => {
      return options.values.state === "sent"
        ? expression.or([
            expression("state", "=", "sending"),
            expression.and([
              expression("state", "=", "suppressed"),
              expression("last_error_code", "=", "invitation_superseded"),
            ]),
          ])
        : expression("state", "=", "sending");
    })
    .execute();
}
