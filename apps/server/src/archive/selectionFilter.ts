import { expressionBuilder } from "kysely";
import type { Expression, ExpressionBuilder, SqlBool } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";

/**
 * One selection, normalised: what the viewer asked the archive to narrow to.
 *
 * Normalised means the ids are sorted and deduplicated, which the request
 * schema already does and this type then preserves. Two spellings of one
 * selection must produce one filter, because the cursor's digest is taken over
 * it and a different digest is a `400`.
 */
export type TimelineFilter = {
  /**
   * The `readonly` stays on this property, against the rule that type
   * aliases are mutable, because this array is shared across a request
   * rather than copied: every function handling one request holds the same
   * filter, and the cursor's digest is taken over it, so a caller that
   * sorted or pushed to it in place would corrupt every other reader's
   * digest.
   */
  tagIds: readonly string[];
  /** Same reasoning as `tagIds`: shared across the request, never copied. */
  personIds: readonly string[];
  from: string | undefined;
  until: string | undefined;
  attachedToMilestoneId: string | undefined;
  excludeAttached: boolean;
};

/**
 * Reads a parsed query string as a selection.
 *
 * Takes the shape of any of this slice's request schemas, which is why every
 * field is optional: the rail and the facets carry four of the six.
 *
 * @param query The parsed query string.
 */
export function makeTimelineFilterFromQuery(query: {
  tags?: readonly string[];
  people?: readonly string[];
  from?: string;
  until?: string;
  attachedToMilestoneId?: string;
  excludeAttached?: boolean;
}): TimelineFilter {
  return {
    tagIds: [...new Set(query.tags ?? [])].sort(),
    personIds: [...new Set(query.people ?? [])].sort(),
    from: query.from,
    until: query.until,
    attachedToMilestoneId: query.attachedToMilestoneId,
    // "Only meaningful beside `attachedToMilestoneId`", so on its own it is
    // dropped rather than rejected: a `400` there would break a bookmark and
    // buy nothing.
    excludeAttached:
      query.attachedToMilestoneId === undefined
        ? false
        : query.excludeAttached === true,
  };
}

/**
 * Whether the selection narrows by **content**, which turns the union off.
 *
 * A date range alone is a window on the same timeline, so milestone-only days
 * survive it and surface 2's `milestone-empty` state keeps working under a
 * date window. A tag, a person or a milestone attachment is a content
 * predicate, and a day with zero matching items is not a result: adding one
 * would put an empty day in the middle of a result list whose strip says 88
 * (`timeline.md` Ruling 1).
 */
export function hasContentFilter(filter: Readonly<TimelineFilter>): boolean {
  return (
    filter.tagIds.length > 0 ||
    filter.personIds.length > 0 ||
    filter.attachedToMilestoneId !== undefined
  );
}

/** Whether anything at all is selected, which is what `resultCount` answers. */
export function hasAnyFilter(filter: Readonly<TimelineFilter>): boolean {
  return (
    hasContentFilter(filter) ||
    filter.from !== undefined ||
    filter.until !== undefined
  );
}

/**
 * Builds one item, ANDed together: this viewer's visibility predicate and
 * everything they asked to narrow by.
 *
 * **Every count and every row list in this slice composes this same
 * expression**, which is what makes it impossible for a count and the page it
 * heads to disagree (`data-models.md` § One rule that outranks the others). No
 * route rewrites the clause, and no count reads a stored column.
 *
 * It builds its own expression builder over `items`, the same way
 * `applyVisibilityFilter` does and for the same reason: the caller's builder
 * usually has other tables in scope, which the types would reject, and the
 * expression is independent of the builder that made it. So the result drops
 * straight into a `where`, an `on` or another expression.
 *
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 * @returns The predicate, true for the rows this request may count and draw.
 */
export function makeSelectionExpressionFromFilter(options: {
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Expression<SqlBool> {
  const { viewer, filter } = options;
  const eb: ExpressionBuilder<Database, "items"> = expressionBuilder<
    Database,
    "items"
  >();

  return eb.and([
    visibilityExpression({ eb, viewer }),
    ..._makeDateConditions({ eb, filter }),
    ..._makeTagConditions({ eb, tagIds: filter.tagIds }),
    ..._makePersonConditions({ eb, personIds: filter.personIds }),
    ..._makeAttachedConditions({ eb, filter }),
  ]);
}

/** Bounds the archive by capture date, both ends inclusive. */
function _makeDateConditions(options: {
  eb: ExpressionBuilder<Database, "items">;
  filter: Readonly<TimelineFilter>;
}): Array<Expression<SqlBool>> {
  const { eb, filter } = options;
  const fromCondition =
    filter.from === undefined
      ? []
      : [eb("items.captured_on", ">=", filter.from)];
  const untilCondition =
    filter.until === undefined
      ? []
      : [eb("items.captured_on", "<=", filter.until)];
  return [...fromCondition, ...untilCondition];
}

/**
 * One `EXISTS` per selected tag, never a join: a join fans the row out and
 * turns a count into a multiple of itself, while each `EXISTS` is a single
 * index probe. `item_tags` is indexed both ways so the planner can drive from
 * whichever predicate is most selective.
 */
function _makeTagConditions(options: {
  eb: ExpressionBuilder<Database, "items">;
  tagIds: readonly string[];
}): Array<Expression<SqlBool>> {
  return options.tagIds.map((tagId) => {
    return options.eb.exists(
      options.eb
        .selectFrom("item_tags")
        .select("item_tags.id")
        .whereRef("item_tags.item_id", "=", "items.id")
        .where("item_tags.tag_id", "=", tagId),
    );
  });
}

/**
 * One `EXISTS` per selected person, for the same reason as
 * `_makeTagConditions`. `item_people` appears here only as a filter the
 * caller asked for. It must never appear in a visibility expression: being in
 * a photograph is not a key to it (Decision 7).
 */
function _makePersonConditions(options: {
  eb: ExpressionBuilder<Database, "items">;
  personIds: readonly string[];
}): Array<Expression<SqlBool>> {
  return options.personIds.map((personId) => {
    return options.eb.exists(
      options.eb
        .selectFrom("item_people")
        .select("item_people.id")
        .whereRef("item_people.item_id", "=", "items.id")
        .where("item_people.person_id", "=", personId),
    );
  });
}

/** Zero conditions when no milestone is selected, otherwise exactly one. */
function _makeAttachedConditions(options: {
  eb: ExpressionBuilder<Database, "items">;
  filter: Readonly<TimelineFilter>;
}): Array<Expression<SqlBool>> {
  const { eb, filter } = options;
  return filter.attachedToMilestoneId === undefined
    ? []
    : [
        _makeAttachedCondition({
          eb,
          milestoneId: filter.attachedToMilestoneId,
          exclude: filter.excludeAttached,
        }),
      ];
}

/** Attached to one occasion, or deliberately not attached to it. */
function _makeAttachedCondition(options: {
  eb: ExpressionBuilder<Database, "items">;
  milestoneId: string;
  exclude: boolean;
}): Expression<SqlBool> {
  const attached = options.eb.exists(
    options.eb
      .selectFrom("item_milestones")
      .select("item_milestones.id")
      .whereRef("item_milestones.item_id", "=", "items.id")
      .where("item_milestones.milestone_id", "=", options.milestoneId),
  );
  return options.exclude ? options.eb.not(attached) : attached;
}
