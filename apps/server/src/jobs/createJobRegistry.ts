import type { Kysely } from "kysely";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { Database } from "../db/types/db.types.ts";
import { runInvitationLapse } from "./runInvitationLapse.ts";
import { runObjectDeletionDrain } from "./runObjectDeletionDrain.ts";
import { runRemovalReminder } from "./runRemovalReminder/runRemovalReminder.ts";
import type { Job } from "./createJobRunner.ts";
import { runSessionSweep } from "./runSessionSweep.ts";
import { runSignInCodeSweep } from "./runSignInCodeSweep.ts";
import { runUploadAbandonSweep } from "./runUploadAbandonSweep/runUploadAbandonSweep.ts";
import { runVisibilityRuleSweep } from "./runVisibilityRuleSweep.ts";

const ONE_HOUR_MS = 3_600_000;
const FIFTEEN_MINUTES_MS = 900_000;
const FIVE_MINUTES_MS = 300_000;
const ONE_DAY_MS = 86_400_000;

/**
 * The seven background jobs, with the cadences
 * `apis/conventions.md` § The job runner gives them.
 *
 * **Seven, and the set is closed.** The document names them so a slice can
 * cite one, and nothing else may join the list: the mail queue runs on the
 * same runner and is deliberately not in here, because it is not one of the
 * seven and its cadence is seconds rather than minutes.
 *
 * Order matches the document's table, so the two can be read side by side.
 *
 * Every `run` reads the clock when it runs, not when the registry is built: a
 * job that froze `now` at boot would drift further from reality every hour.
 *
 * @param deps.database The catalog.
 * @param deps.b2 Backblaze, which `object-deletion-drain` and
 *   `upload-abandon-sweep` touch, the second only outside its transaction.
 * @param deps.clock Overridable so a test can hold time still.
 */
export function createJobRegistry(deps: {
  database: Kysely<Database>;
  b2: B2Client;
  clock?: () => Date;
}): Job[] {
  const clock =
    deps.clock ??
    (() => {
      return new Date();
    });
  const now = (): string => {
    return clock().toISOString();
  };

  return [
    {
      name: "session-sweep",
      intervalMs: ONE_HOUR_MS,
      run: async () => {
        await runSessionSweep({ database: deps.database, now: now() });
      },
    },
    {
      name: "invitation-lapse",
      intervalMs: ONE_HOUR_MS,
      run: async () => {
        await runInvitationLapse({ database: deps.database, now: now() });
      },
    },
    {
      name: "sign-in-code-sweep",
      intervalMs: ONE_HOUR_MS,
      run: async () => {
        await runSignInCodeSweep({ database: deps.database, now: now() });
      },
    },
    {
      name: "upload-abandon-sweep",
      intervalMs: FIFTEEN_MINUTES_MS,
      run: async () => {
        await runUploadAbandonSweep({
          database: deps.database,
          b2: deps.b2,
          now: now(),
        });
      },
    },
    {
      name: "removal-reminder",
      intervalMs: ONE_HOUR_MS,
      run: async () => {
        await runRemovalReminder({ database: deps.database, now: now() });
      },
    },
    {
      name: "object-deletion-drain",
      intervalMs: FIVE_MINUTES_MS,
      run: async () => {
        await runObjectDeletionDrain({
          database: deps.database,
          b2: deps.b2,
          now: now(),
        });
      },
    },
    {
      name: "visibility-rule-sweep",
      intervalMs: ONE_DAY_MS,
      run: async () => {
        await runVisibilityRuleSweep({ database: deps.database });
      },
    },
  ];
}
