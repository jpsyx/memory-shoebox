import { signInCodeEmailPayloadSchema } from "@memory-shoebox/shared";
import {
  seedMember,
  type MemberRole,
} from "../../apps/server/scripts/seedMember.ts";
import { createDatabase } from "../../apps/server/src/db/client.ts";
import { E2E_BASE_URL, E2E_DATABASE_PATH } from "./e2eEnvironment.ts";

/**
 * Runs `work` against the catalog the server under test is using, then closes.
 *
 * A second handle on the same file rather than a route, because none of this
 * is something the product does: there is no route that creates a member (that
 * is step 8a) and there must never be one that reads a sign-in code.
 */
async function _withDatabase<T>(
  work: (database: ReturnType<typeof createDatabase>) => Promise<T>,
): Promise<T> {
  const database = createDatabase(E2E_DATABASE_PATH);
  try {
    return await work(database);
  } finally {
    await database.destroy();
  }
}

/**
 * Makes somebody who can sign in.
 *
 * @param options.email The address to invite.
 * @param options.role Their role. Defaults to admin, because the five admin
 *   doors are one of the things surface 9 has to show.
 * @returns The seeded member's id.
 */
export function seedMemberAtAddress(options: {
  email: string;
  role?: MemberRole;
}): Promise<{ memberId: string }> {
  return _withDatabase(async (database) => {
    const seeded = await seedMember({
      database,
      email: options.email,
      role: options.role ?? "admin",
      baseUrl: E2E_BASE_URL,
    });
    return { memberId: seeded.memberId };
  });
}

/**
 * Reads the six digits most recently mailed to an address.
 *
 * **This works because the run's mail is unconfigured.** The worker defers a
 * message it cannot send back to `queued` without scrubbing it, so the digits
 * stay in `payload_json`. A run with a working sender would find the row
 * scrubbed and this would fail, loudly and correctly.
 *
 * Ordered by `id` rather than `created_at`: ids are uuidv7 with a
 * sub-millisecond counter, so they order two rows written in the same
 * millisecond and a timestamp does not.
 *
 * @param email The address the code went to.
 * @returns The six digits.
 */
export async function readSignInCode(email: string): Promise<string> {
  const row = await _withDatabase((database) => {
    return database
      .selectFrom("outbound_emails")
      .select(["payload_json", "state"])
      .where("to_address", "=", email.trim().toLowerCase())
      .where("kind", "=", "sign_in_code")
      .orderBy("id", "desc")
      .limit(1)
      .executeTakeFirst();
  });

  if (row === undefined) {
    throw new Error(`No sign-in code was queued for ${email}.`);
  }

  const payload = signInCodeEmailPayloadSchema.safeParse(
    JSON.parse(row.payload_json),
  );
  if (!payload.success) {
    throw new Error(
      `The sign-in code row for ${email} is ${row.state} and its payload has been scrubbed. ` +
        "The run's mail must be unconfigured: no RESEND_API_KEY, no ENABLE_FAKE_EMAIL.",
    );
  }
  return payload.data.code;
}

/**
 * Deletes every `item_views` row for one member.
 *
 * A second handle on the same file, for the same reason `readSignInCode`
 * takes one: this undoes what `seedItemViews` writes on a member's first
 * sign-in, which is not something any route does either. A member seeded and
 * signed in through `signedIn.ts`'s shared fixtures already has every item
 * that existed at that moment marked seen, so the seen latch spec calls this
 * to put a member genuinely back into an unseen state before it measures
 * what the latch does.
 *
 * @param memberId The member whose views to clear.
 */
export async function clearItemViewsForMember(memberId: string): Promise<void> {
  await _withDatabase(async (database) => {
    await database
      .deleteFrom("item_views")
      .where("member_id", "=", memberId)
      .execute();
  });
}

/** One `item_views` row, as the latch spec reads it. */
export type ItemViewRow = {
  itemId: string;
  firstSeenAt: string;
  firstOpenedAt: string | undefined;
  openCount: number;
};

/**
 * Every view row one member has, for asserting what opening an item wrote:
 * `first_opened_at` on the item itself, and `first_seen_at` alone on its
 * siblings (`items.md` Ruling 6).
 *
 * @param memberId The member whose rows to read.
 */
export function readItemViewsForMember(
  memberId: string,
): Promise<ItemViewRow[]> {
  return _withDatabase(async (database) => {
    const rows = await database
      .selectFrom("item_views")
      .select(["item_id", "first_seen_at", "first_opened_at", "open_count"])
      .where("member_id", "=", memberId)
      .execute();
    return rows.map((row) => {
      return {
        itemId: row.item_id,
        firstSeenAt: row.first_seen_at,
        firstOpenedAt: row.first_opened_at ?? undefined,
        openCount: row.open_count,
      };
    });
  });
}
