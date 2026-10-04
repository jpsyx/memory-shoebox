import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { RemovalRequestRow } from "./makeRemovalRequestDtosFromRows.ts";
import {
  readRemovalEmailLookups,
  makeRemovalEmailContextFromRequest,
  isRemovalEmailRecipient,
  enqueueRemovalEmailForRecipient,
} from "./removalEmailHelpers.ts";

/** Reminder calls must supply the local-calendar week of every request. */
export type RemovalEmailOptions = {
  transaction: DatabaseExecutor;
  requests: readonly RemovalRequestRow[];
  actorMemberId: string;
  now: string;
} & (
  | {
      event: "requested" | "deleted" | "declined" | "withdrawn";
      weekIndexes?: never;
    }
  | { event: "reminder"; weekIndexes: ReadonlyMap<string, number> }
);

/** Freezes active recipients and facts; requester answers bypass preferences. */
export async function enqueueRemovalEmails(
  options: Readonly<RemovalEmailOptions>,
): Promise<{ recipientCount: number }> {
  if (options.requests.length === 0) {
    return { recipientCount: 0 };
  }
  const lookups = await readRemovalEmailLookups(options);
  const recipientCount = await options.requests.reduce(
    async (previousRequestEnqueue, request) => {
      const previousRequestCount = await previousRequestEnqueue;
      const context = makeRemovalEmailContextFromRequest({
        options,
        request,
        lookups,
      });
      return lookups.members
        .filter((member) => {
          return isRemovalEmailRecipient({
            event: options.event,
            request,
            member,
            actorMemberId: options.actorMemberId,
          });
        })
        .reduce(async (previousRecipientEnqueue, member) => {
          const previousRecipientCount = await previousRecipientEnqueue;
          const result = await enqueueRemovalEmailForRecipient({
            options,
            context,
            member,
            lookups,
          });
          return (
            previousRecipientCount +
            (result.state === "already_enqueued" ? 0 : 1)
          );
        }, Promise.resolve(previousRequestCount));
    },
    Promise.resolve(0),
  );
  return { recipientCount };
}
