import { expressionBuilder } from "kysely";
import type {
  Expression,
  ExpressionBuilder,
  SelectQueryBuilder,
  SqlBool,
} from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";

/**
 * This viewer's visibility predicate, as an expression to compose anywhere.
 *
 * **This and its wrapper are the one sanctioned reader of
 * `Viewer.visibleRuleIds`, and every read route composes one of them rather
 * than rewriting the expression** (`conventions.md` § The visibility
 * predicate). A count and the page it heads cannot disagree when they share
 * this function; two hand-written copies of the clause is how they start to.
 *
 * Which of the two to reach for:
 *
 * | Where the predicate goes                 | Use                     |
 * | ---------------------------------------- | ----------------------- |
 * | The `WHERE` of a select over `items`     | `applyVisibilityFilter` |
 * | **The `ON` clause of a join to `items`** | `visibilityExpression`  |
 * | An `EXISTS`, a `CASE`, a composed `or`   | `visibilityExpression`  |
 *
 * **The `ON` clause is the case that is easy to get wrong and silent when
 * wrong.** The people directory left-joins `items` through `item_people`, and
 * with this predicate in its `WHERE` the left join collapses to an inner one:
 * everybody with no visible photograph disappears from the directory,
 * including the person with none at all, and no fixture where every person has
 * one visible photograph shows it (`timeline.md` § Performance, which calls it
 * the single most likely bug in that slice; `data-models.md` § The queries
 * that will hurt first).
 *
 * The expression is `visibility_rule_id IN (:visibleRuleIds) OR uploaded_by =
 * :viewerMemberId`, parenthesised as a unit so a caller's own `where` cannot
 * bind to one half of the `or` and widen the result back out. The second half
 * is clause 2 of `data-models.md` § The evaluation and cannot leak: it only
 * ever adds items the viewer put there themselves. `item_people` must never
 * appear here: being in a photograph is not a key to it (Decision 7).
 *
 * **An admin gets the literal `true`.** `applyVisibilityFilter` can hand an
 * admin's query straight back, because a `WHERE` that is never added restricts
 * nothing. An expression has no such absent form: leaving it out of an `ON`
 * clause changes which rows the join matches, so an admin's "no restriction"
 * has to be written as the condition that holds for every row. The compiled
 * join ends `on "items"."id" = "item_people"."item_id" and true`, which reads
 * as what it is.
 *
 * It names `items`, so the caller's query must bring `items` into scope
 * unaliased. `selectFrom("items as i")`, the way the specification documents
 * write the query, puts `i` in scope instead and the types reject it. Carrying
 * the alias through would mean assembling the column references as strings,
 * which Kysely can no longer check, and that is a worse trade than dropping
 * the alias. Drop it; do not hand-write the clause.
 *
 * @param options.eb The expression builder, with `items` in scope.
 * @param options.viewer The request's viewer.
 * @returns The predicate, true for the rows of `items` this viewer may see.
 */
export function visibilityExpression(options: {
  eb: ExpressionBuilder<Database, "items">;
  viewer: Viewer;
}): Expression<SqlBool> {
  const { eb, viewer } = options;
  if (viewer.isAdmin) {
    return eb.lit(true);
  }

  const uploadedByMe = eb("items.uploaded_by", "=", viewer.memberId);
  // An empty set is not a state a real viewer reaches, because the seeded
  // `everyone` rule is visible to everybody. It is still written out: an
  // `IN ()` is a SQLite syntax error, so the empty case has to be the
  // uploader clause alone rather than a query that throws.
  if (viewer.visibleRuleIds.length === 0) {
    return uploadedByMe;
  }
  return eb.or([
    eb("items.visibility_rule_id", "in", viewer.visibleRuleIds),
    uploadedByMe,
  ]);
}

/**
 * Adds this viewer's visibility predicate to the `WHERE` of a query over
 * `items`.
 *
 * A thin wrapper over {@link visibilityExpression}, which documents the
 * predicate itself and says when a route wants the expression instead. The
 * short answer: a query whose `items` arrive through a **left join** needs the
 * expression in the join's `ON` clause, and a `WHERE` cannot go there. A query
 * that inner-joins other tables to `items` is fine here and keeps them: the
 * builder it gets back is the one it passed in.
 *
 * **An admin gets the query back untouched**, which is both correct and
 * fastest: they see everything, and it cannot be switched off, not even by
 * another admin.
 *
 * @param options.query Any select over `items`, joined tables included.
 * @param options.viewer The request's viewer.
 * @returns The same query, narrowed to what the viewer may see.
 */
export function applyVisibilityFilter<
  TB extends keyof Database,
  Output,
>(options: {
  query: SelectQueryBuilder<Database, TB | "items", Output>;
  viewer: Viewer;
}): SelectQueryBuilder<Database, TB | "items", Output> {
  const { query, viewer } = options;
  if (viewer.isAdmin) {
    return query;
  }

  // The expression is built from a standalone builder rather than from the
  // callback form of `where`. Both compile to the same node, and this one
  // types when `TB` is still generic, which is what lets a caller whose query
  // carries a join get their own query type back.
  return query.where(
    visibilityExpression({
      eb: expressionBuilder<Database, "items">(),
      viewer,
    }),
  );
}
