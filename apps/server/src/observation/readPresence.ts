import { sql } from "kysely";
import type { PresenceResponse, PresenceRow } from "@memory-shoebox/shared";
import type { MembersTable } from "../db/types/identityAndAccess.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { getPresenceLocalDayIntervalsFromWindow } from "./getPresenceLocalDayIntervalsFromWindow.ts";

type PresenceOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  memberId: string | undefined;
  now: string;
};
type MemberCounts = { memberId: string; metric: string; count: number };

async function _readActiveDayCounts(
  options: Readonly<{
    database: DatabaseExecutor;
    now: string;
    timezone: string;
  }>,
): Promise<Map<string, number>> {
  const intervals = getPresenceLocalDayIntervalsFromWindow(options);
  const firstInterval = intervals.at(0);
  if (firstInterval === undefined) {
    return new Map();
  }
  // Disconnected intervals share a date label, counted once per member.
  const dayCases = intervals.map((interval) => {
    return sql`when occurred_at >= ${interval.startsAt} and occurred_at < ${interval.endsAt} then ${interval.localDate}`;
  });
  const rows = await sql<{ memberId: string; count: number }>`
    select member_id as memberId, count(distinct case ${sql.join(dayCases, sql` `)} end) as count
    from (
      select member_id, first_seen_at as occurred_at from item_views
      union select member_id, first_opened_at from item_views where first_opened_at is not null
      union select member_id, last_opened_at from item_views where last_opened_at is not null
      union select author_member_id, created_at from comments
      union select member_id, created_at from item_reactions
      union select member_id, created_at from comment_reactions
    ) as marks
    where occurred_at >= ${firstInterval.startsAt} and occurred_at <= ${options.now}
    group by member_id
  `.execute(options.database);
  return new Map(
    rows.rows.map((row) => {
      return [row.memberId, Number(row.count)];
    }),
  );
}

async function _readLiveCounts(
  database: DatabaseExecutor,
): Promise<Map<string, Map<string, number>>> {
  const rows = await sql<MemberCounts>`
    select memberId, metric, sum(count) as count from (
      select member_id as memberId, 'opened' as metric, count(*) as count from item_views where first_opened_at is not null group by member_id
      union all select author_member_id, 'comments', count(*) from comments group by author_member_id
      union all select member_id, 'reactions', count(*) from item_reactions group by member_id
      union all select member_id, 'reactions', count(*) from comment_reactions group by member_id
    ) as counts group by memberId, metric
  `.execute(database);
  return rows.rows.reduce((counts, row) => {
    const memberCounts = counts.get(row.memberId) ?? new Map<string, number>();
    memberCounts.set(row.metric, Number(row.count));
    counts.set(row.memberId, memberCounts);
    return counts;
  }, new Map<string, Map<string, number>>());
}

function _comparePresenceRows(
  first: Readonly<PresenceRow>,
  second: Readonly<PresenceRow>,
): number {
  return (
    second.activeDaysCount - first.activeDaysCount ||
    second.itemsOpenedCount - first.itemsOpenedCount ||
    second.commentsWrittenCount - first.commentsWrittenCount ||
    (second.lastSignedInAt ?? "").localeCompare(first.lastSignedInAt ?? "") ||
    first.member.displayName.localeCompare(second.member.displayName)
  );
}

function _makePresenceRowFromMember(
  options: Readonly<{
    member: MembersTable;
    activeDays: ReadonlyMap<string, number>;
    liveCounts: ReadonlyMap<string, ReadonlyMap<string, number>>;
  }>,
): PresenceRow {
  const { member } = options;
  const counts = options.liveCounts.get(member.id);
  return {
    member: {
      memberId: member.id,
      displayName: getDisplayNameFromMember({
        storedDisplayName: member.display_name ?? undefined,
        email: member.email,
      }),
    },
    email: member.email,
    status: member.status === "invited" ? "invited" : "active",
    invitedAt: member.created_at,
    joinedAt: member.joined_at,
    lastSignedInAt: member.last_signed_in_at,
    lastSeenAt: member.last_seen_at,
    activeDaysCount: options.activeDays.get(member.id) ?? 0,
    activeDaysWindowDays: 90,
    itemsOpenedCount: counts?.get("opened") ?? 0,
    commentsWrittenCount: counts?.get("comments") ?? 0,
    reactionsLeftCount: counts?.get("reactions") ?? 0,
  };
}

async function _readPresenceMembers(
  options: Readonly<PresenceOptions>,
): Promise<MembersTable[]> {
  const { database, viewer } = options;
  if (
    !viewer.isAdmin &&
    options.memberId !== undefined &&
    options.memberId !== viewer.memberId
  ) {
    throw ApiError.forbidden("presence_forbidden");
  }
  const memberId =
    options.memberId ?? (viewer.isAdmin ? undefined : viewer.memberId);
  let membersQuery = database.selectFrom("members").selectAll();
  if (memberId !== undefined) {
    membersQuery = membersQuery.where("id", "=", memberId);
  }
  const members = await membersQuery.execute();
  if (memberId !== undefined && members.length === 0) {
    throw ApiError.notFound("member_not_found");
  }
  return members.filter((member) => {
    return member.status === "active" || member.status === "invited";
  });
}

/** Reads live participation from durable marks without analytics writes. */
export async function readPresence(
  options: Readonly<PresenceOptions>,
): Promise<PresenceResponse> {
  const { database } = options;
  const members = await _readPresenceMembers(options);
  const settings = await readInstanceSettings({
    database,
    keys: ["shoebox.timezone"],
  });
  const [activeDays, liveCounts] = await Promise.all([
    _readActiveDayCounts({
      database,
      now: options.now,
      timezone: settings["shoebox.timezone"],
    }),
    _readLiveCounts(database),
  ]);
  const presence = members
    .map((member) => {
      return _makePresenceRowFromMember({ member, activeDays, liveCounts });
    })
    .sort(_comparePresenceRows);
  return { presence, nextCursor: null };
}
