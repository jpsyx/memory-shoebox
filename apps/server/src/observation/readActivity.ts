import { z } from "zod";
import type { SelectQueryBuilder } from "kysely";
import {
  activitySubjectSchema,
  idSchema,
  timestampSchema,
  type ActivityEntryDto,
  type ActivityRequest,
  type ActivityResponse,
} from "@memory-shoebox/shared";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { ActivityEventsTable } from "../db/types/operations.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { getActivityDetailFromEvent } from "./getActivityDetailFromEvent.ts";
import {
  ACTIVITY_KINDS_BY_FAMILY,
  getActivityFamilyFromKind,
} from "./getActivityFamilyFromKind.ts";

const CURSOR_SCHEMA = z.strictObject({
  occurredAt: timestampSchema,
  entryId: idSchema,
});

function _getPositionFromCursor(
  cursor: string | undefined,
): z.infer<typeof CURSOR_SCHEMA> | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(cursor, "base64url");
    if (
      !/^[A-Za-z0-9_-]+$/.test(cursor) ||
      decoded.toString("base64url") !== cursor
    ) {
      throw new Error("Invalid encoding");
    }
    return CURSOR_SCHEMA.parse(JSON.parse(decoded.toString("utf8")));
  } catch {
    throw ApiError.invalidRequest({
      cursor: ["The activity cursor is not valid."],
    });
  }
}

function _makeActivityEntryFromEvent(
  event: Readonly<ActivityEventsTable>,
): ActivityEntryDto {
  return {
    entryId: event.id,
    kind: event.kind,
    family: getActivityFamilyFromKind(event.kind),
    occurredAt: event.occurred_at,
    actor: { memberId: event.actor_member_id, label: event.actor_label },
    subject: activitySubjectSchema.parse({
      kind: event.subject_kind,
      id: event.subject_id,
      label: event.subject_label,
    }),
    deviceLabel: event.device_label,
    detail: getActivityDetailFromEvent(event),
  };
}

function _getEventsQueryFromFilters(
  options: Readonly<{ database: DatabaseExecutor; query: ActivityRequest }>,
): SelectQueryBuilder<Database, "activity_events", ActivityEventsTable> {
  const { query } = options;
  const position = _getPositionFromCursor(query.cursor);
  let eventsQuery = options.database.selectFrom("activity_events").selectAll();
  if (query.family !== undefined) {
    eventsQuery = eventsQuery.where(
      "kind",
      "in",
      ACTIVITY_KINDS_BY_FAMILY[query.family],
    );
  }
  if (query.actorMemberId !== undefined) {
    eventsQuery = eventsQuery.where(
      "actor_member_id",
      "=",
      query.actorMemberId,
    );
  }
  if (query.subjectId !== undefined) {
    eventsQuery = eventsQuery.where("subject_id", "=", query.subjectId);
  }
  if (position !== undefined) {
    eventsQuery = eventsQuery.where((eb) => {
      return eb.or([
        eb("occurred_at", "<", position.occurredAt),
        eb.and([
          eb("occurred_at", "=", position.occurredAt),
          eb("id", "<", position.entryId),
        ]),
      ]);
    });
  }
  return eventsQuery;
}

async function _assertKnownStoredKinds(
  database: DatabaseExecutor,
): Promise<void> {
  const storedKinds = await database
    .selectFrom("activity_events")
    .select("kind")
    .distinct()
    .execute();
  storedKinds.forEach((row) => {
    getActivityFamilyFromKind(row.kind);
  });
}

/** Reads historical audit rows with deterministic timestamp/id pagination. */
export async function readActivity(
  options: Readonly<{ database: DatabaseExecutor; query: ActivityRequest }>,
): Promise<ActivityResponse> {
  // Validate the whole vocabulary before family filters can hide corrupt rows.
  await _assertKnownStoredKinds(options.database);
  const eventsQuery = _getEventsQueryFromFilters(options);
  const { query } = options;
  const limit = query.limit ?? 50;
  const events = await eventsQuery
    .orderBy("occurred_at", "desc")
    .orderBy("id", "desc")
    .limit(limit + 1)
    .execute();
  const activity = events.slice(0, limit).map(_makeActivityEntryFromEvent);
  const lastEntry = activity.at(-1);
  return {
    activity,
    nextCursor:
      events.length > limit && lastEntry !== undefined
        ? Buffer.from(
            JSON.stringify({
              occurredAt: lastEntry.occurredAt,
              entryId: lastEntry.entryId,
            }),
          ).toString("base64url")
        : null,
  };
}
