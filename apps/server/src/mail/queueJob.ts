import type { Kysely } from "kysely";
import type { Database } from "../db/types.ts";
import type { Job } from "../jobs/runner.ts";
import type { MailSender } from "./sender.ts";
import { runMailQueueOnce } from "./worker.ts";

/** Ten seconds. */
const MAIL_QUEUE_INTERVAL_MS = 10_000;

/**
 * The mail queue, driven on the same runner as the seven jobs.
 *
 * **It is not one of the seven.** `conventions.md` § The job runner names a
 * closed set, and this is not in it: its cadence is seconds where theirs are
 * minutes, and a slice citing "the seven jobs" should find seven. It shares
 * the runner only because the runner already owns the things a loop like this
 * needs: an overlap guard, a failure that is logged rather than fatal, and a
 * stop that waits.
 *
 * Ten seconds, and no immediate kick after an enqueue. That keeps
 * `enqueueEmail` a plain write inside somebody else's transaction, with
 * nothing to fire after a commit that may yet roll back, and the worst case
 * for a sign-in code is ten seconds on top of the provider's own latency.
 *
 * @param deps.database The catalog.
 * @param deps.sender Null on an instance with no `RESEND_API_KEY`, which the
 *   worker handles by deferring rather than failing.
 * @param deps.clock Overridable so a test can hold time still.
 * @returns The job, ready for the runner.
 */
export function createMailQueueJob(deps: {
  database: Kysely<Database>;
  sender: MailSender | null;
  clock?: () => Date;
}): Job {
  const clock =
    deps.clock ??
    (() => {
      return new Date();
    });

  return {
    name: "mail-queue",
    intervalMs: MAIL_QUEUE_INTERVAL_MS,
    run: async () => {
      await runMailQueueOnce({
        database: deps.database,
        sender: deps.sender,
        now: clock().toISOString(),
      });
    },
  };
}
