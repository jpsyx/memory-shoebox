import { sql, type Kysely } from "kysely";

/**
 * The id of the `everyone` rule, seeded below.
 *
 * A constant rather than a minted uuid because `mode: 'everyone'` is the
 * default on every upload and on every visibility edit, and the API contract
 * short-circuits straight to this id with no lookup at all
 * (`data-models.md` § What that costs, `apis/upload.md`, `apis/items.md`).
 * It is readable rather than uuid-shaped so that an `items` row inspected in
 * the `sqlite3` shell says what it means.
 */
export const EVERYONE_VISIBILITY_RULE_ID = "visibility-rule-everyone";

/**
 * Visibility: the decision every other table is shaped around.
 *
 * The rule is hoisted out of the item. One upload is one decision covering
 * hundreds of files, so an archive holds tens of distinct rules rather than
 * one per item, and every archive query carries an indexed
 * `visibility_rule_id IN (:visible)` instead of a correlated `EXISTS` per row.
 * That is what makes a count and the page it heads use the identical
 * predicate, so the two cannot disagree.
 *
 * An item is visible to a member when any of: they are an admin; they
 * uploaded it; the mode is `everyone`; the mode is `only` and they are among
 * the expanded subjects; the mode is `except` and they are not.
 *
 * **`item_people` must never appear in a visibility expression.** Being in a
 * photograph is not a key to it, and only having uploaded it is. Nothing in
 * the schema can enforce that, so it is written here: a photograph restricted
 * to admins and people-tagged for a viewer stays invisible to that viewer and
 * absent from their day count.
 */
export const up = async (database: Kysely<unknown>): Promise<void> => {
  // Rules are immutable from the product's edit path: changing one item's
  // visibility points it at a different rule, creating one if no rule with
  // that digest exists yet, because editing a shared rule would change every
  // other item on it. A rule nothing references is swept later.
  await database.schema
    .createTable("visibility_rules")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("mode", "text", (column) => {
      return column
        .notNull()
        .check(sql`mode IN ('everyone', 'only', 'except')`);
    })
    // A canonical hash of the sorted subject list, used to find an existing
    // rule before inserting one. Empty string for `everyone`, not null: it is
    // a digest of no subjects rather than an absent digest, and a null would
    // make the dedupe lookup need a second form.
    .addColumn("subject_digest", "text", (column) => {
      return column.notNull();
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // Serves the dedupe lookup, `WHERE mode = ? AND subject_digest = ?`.
  //
  // **Deliberately not unique.** Deleting a member can make two previously
  // distinct rules collide, and tolerating an equivalent duplicate is cheaper
  // than merging them mid-transaction. Two rows sharing a digest have the same
  // subject list by construction, so the resolver takes the lowest id.
  await database.schema
    .createIndex("visibility_rules_mode_digest")
    .on("visibility_rules")
    .columns(["mode", "subject_digest"])
    .execute();

  // The default, seeded so it costs no lookup. `mode: 'except'` with no
  // subjects normalises to this row too, rather than becoming a second way of
  // saying the same thing.
  await sql`
    INSERT INTO visibility_rules (id, mode, subject_digest, created_at)
    VALUES (${EVERYONE_VISIBILITY_RULE_ID}, 'everyone', '', ${new Date().toISOString()})
  `.execute(database);

  // `group_id` is RESTRICT while `member_id` beside it is CASCADE, and the
  // asymmetry is the point. Taking a group out of an `only` rule narrows
  // access, which is safe; taking it out of an `except` rule *widens* it, and
  // a rule that hid fifty photographs from the cousins would become a rule
  // that hides them from nobody. A cascade would do that silently, at the
  // moment an admin pressed a button labelled "delete a group". So the
  // database refuses, and the Groups surface does the rewrite deliberately
  // inside a transaction, having told the admin what happens in both
  // directions. One case to handle there rather than here: an `only` rule
  // whose last subject goes becomes an empty allow list, which fails closed
  // to admins, and the admin is told rather than finding out later.
  //
  // No label column. The restricted marker a viewer reads ("Just us two") is
  // composed from these rows at read time, because the rule is shared and
  // deduped and a stored label goes stale the moment a group is renamed.
  await database.schema
    .createTable("visibility_rule_subjects")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("rule_id", "text", (column) => {
      return column
        .notNull()
        .references("visibility_rules.id")
        .onDelete("cascade");
    })
    .addColumn("subject_type", "text", (column) => {
      return column.notNull().check(sql`subject_type IN ('member', 'group')`);
    })
    .addColumn("member_id", "text", (column) => {
      return column.references("members.id").onDelete("cascade");
    })
    .addColumn("group_id", "text", (column) => {
      return column.references("groups.id").onDelete("restrict");
    })
    // Two conditions, written as two constraints so a violation names the one
    // that broke: exactly one of the id columns is set, and the one that is
    // set is the one `subject_type` says it is.
    .addCheckConstraint(
      "visibility_rule_subjects_one_subject",
      sql`(member_id IS NULL) <> (group_id IS NULL)`,
    )
    .addCheckConstraint(
      "visibility_rule_subjects_subject_type_agrees",
      sql`(subject_type = 'member') = (member_id IS NOT NULL)`,
    )
    // One subject appears on a rule once. SQLite counts distinct nulls as
    // distinct in a unique index, so with one id column always null this
    // constraint does not fire on its own; the application dedupes the subject
    // list before it writes, and the canonical digest above is what a second
    // identical rule collapses into.
    .addUniqueConstraint("visibility_rule_subjects_subject_unique", [
      "rule_id",
      "subject_type",
      "member_id",
      "group_id",
    ])
    .execute();

  // The reverse sweep: every rule naming this member, or this group. The
  // group one is what the Groups surface reads before a deletion the database
  // would otherwise refuse, to tell the admin which rules it must rewrite.
  await database.schema
    .createIndex("visibility_rule_subjects_member")
    .on("visibility_rule_subjects")
    .column("member_id")
    .execute();

  await database.schema
    .createIndex("visibility_rule_subjects_group")
    .on("visibility_rule_subjects")
    .column("group_id")
    .execute();
};

/** Drops the two tables, children first so the foreign keys stay satisfied. */
export const down = async (database: Kysely<unknown>): Promise<void> => {
  await database.schema.dropTable("visibility_rule_subjects").execute();
  await database.schema.dropTable("visibility_rules").execute();
};
