import type { SelectQueryBuilder } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";

/**
 * Adds this viewer's visibility predicate to a query over `items`.
 *
 * **This is the one sanctioned reader of `Viewer.visibleRuleIds`, and every
 * read route composes it rather than rewriting the expression**
 * (`conventions.md` § The visibility predicate). A count and the page it heads
 * cannot disagree when they share this function; two hand-written copies of
 * the clause is how they start to.
 *
 * The expression is `visibility_rule_id IN (:visibleRuleIds) OR uploaded_by =
 * :viewerMemberId`. The second half is clause 2 of `data-models.md`
 * § The evaluation and cannot leak: it only ever adds items the viewer put
 * there themselves. `item_people` must never appear here: being in a
 * photograph is not a key to it (Decision 7).
 *
 * **An admin gets the query back untouched**, which is both correct and
 * fastest: they see everything, and it cannot be switched off, not even by
 * another admin.
 *
 * @param options.query Any select over `items`.
 * @param options.viewer The request's viewer.
 * @returns The same query, narrowed to what the viewer may see.
 */
export function applyVisibilityFilter<Output>(options: {
  query: SelectQueryBuilder<Database, "items", Output>;
  viewer: Viewer;
}): SelectQueryBuilder<Database, "items", Output> {
  const { query, viewer } = options;
  if (viewer.isAdmin) {
    return query;
  }

  const ruleIds = [...viewer.visibleRuleIds];
  return query.where((eb) => {
    const uploadedByMe = eb("items.uploaded_by", "=", viewer.memberId);
    // An empty set is not a state a real viewer reaches, because the seeded
    // `everyone` rule is visible to everybody. It is still written out: an
    // `IN ()` is a SQLite syntax error, so the empty case has to be the
    // uploader clause alone rather than a query that throws.
    if (ruleIds.length === 0) {
      return uploadedByMe;
    }
    return eb.or([eb("items.visibility_rule_id", "in", ruleIds), uploadedByMe]);
  });
}
