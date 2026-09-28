import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";

/**
 * Marks every item that already exists as seen by a brand-new member.
 *
 * Decision 3: the accent dot means **"arrived since you joined"**, not
 * "exists". Without this, all 2,147 items carry a dot on somebody's first
 * morning, they scroll a few days, and several hundred stay marked new
 * forever, which drains the accent of meaning everywhere else in the product.
 *
 * **No visibility predicate**, deliberately: filtering here would light up old
 * photographs later, the day a rule changed.
 *
 * **One statement.** Roughly 17,000 rows for a nine-person Shoebox, once, in
 * milliseconds; a uuid minted per row in application code would make it 17,000
 * round trips, which is why `db/client.ts` registers `create_id()` as a SQL
 * function. It writes `first_seen_at` only, so a new member does not appear on
 * surface 17 as having opened the entire archive.
 *
 * The `where 1 = 1` is not decoration: SQLite cannot parse an upsert clause
 * attached to an `INSERT ... SELECT` without a `WHERE`, and the
 * `ON CONFLICT DO NOTHING` is what makes this safe to run twice.
 */
export async function seedItemViews(options: {
  transaction: Kysely<Database>;
  memberId: string;
  now: string;
}): Promise<void> {
  await sql`
    insert into item_views (id, member_id, item_id, first_seen_at)
    select create_id(), ${options.memberId}, item.id, ${options.now}
    from items as item
    where 1 = 1
    on conflict do nothing
  `.execute(options.transaction);
}
