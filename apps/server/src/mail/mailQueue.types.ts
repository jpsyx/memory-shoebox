import type { Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { EmailService } from "./EmailService/EmailService.types.ts";

/** One claimed row, exactly as the selection reads it. */
export type OutboundEmailRow = Database["outbound_emails"];

/** What one row's pass did. `skipped` is a row another worker claimed. */
export type RowOutcome =
  | "sent"
  | "failed"
  | "suppressed"
  | "deferred"
  | "skipped";

/** Everything a row's pass needs that is the same for every row in it. */
export type WorkerContext = {
  database: Kysely<Database>;
  sender: EmailService | undefined;
  now: string;
  fromAddress: string | undefined;
  fromName: string | undefined;
};
