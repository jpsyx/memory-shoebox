import type {
  ItemViewerRow,
  ItemViewersResponse,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { MembersTable } from "../db/types/identityAndAccess.types.ts";
import type { ItemViewsTable } from "../db/types/operations.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  type VisibleItem,
  getVisibleItemOr404,
} from "../items/getVisibleItemOr404.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";

type MemberView = Pick<
  MembersTable,
  "id" | "email" | "display_name" | "role" | "status"
> & {
  [Field in
    | "first_seen_at"
    | "first_opened_at"
    | "last_opened_at"
    | "open_count"]: ItemViewsTable[Field] | null;
};

async function _getExpandedMemberIdsFromRule(
  options: Readonly<{ database: DatabaseExecutor; ruleId: string }>,
): Promise<Set<string>> {
  const subjects = await options.database
    .selectFrom("visibility_rule_subjects")
    .leftJoin(
      "group_members",
      "group_members.group_id",
      "visibility_rule_subjects.group_id",
    )
    .select([
      "visibility_rule_subjects.member_id as memberId",
      "group_members.member_id as groupMemberId",
    ])
    .where("visibility_rule_subjects.rule_id", "=", options.ruleId)
    .execute();
  return new Set(
    subjects.flatMap((subject) => {
      return [subject.memberId, subject.groupMemberId].filter((memberId) => {
        return memberId !== null;
      });
    }),
  );
}

function _compareViewerRows(
  first: Readonly<ItemViewerRow>,
  second: Readonly<ItemViewerRow>,
): number {
  return (
    Number(second.hasOpened) - Number(first.hasOpened) ||
    second.openCount - first.openCount ||
    (second.lastOpenedAt ?? "").localeCompare(first.lastOpenedAt ?? "") ||
    Number(first.firstSeenAt === null) - Number(second.firstSeenAt === null) ||
    (first.firstSeenAt ?? "").localeCompare(second.firstSeenAt ?? "") ||
    first.member.displayName.localeCompare(second.member.displayName)
  );
}

async function _readMemberViewsFromItem(
  options: Readonly<{ database: DatabaseExecutor; itemId: string }>,
): Promise<MemberView[]> {
  return options.database
    .selectFrom("members")
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.member_id", "=", "members.id")
        .on("item_views.item_id", "=", options.itemId);
    })
    .select([
      "members.id",
      "members.email",
      "members.display_name",
      "members.role",
      "members.status",
      "item_views.first_seen_at",
      "item_views.first_opened_at",
      "item_views.last_opened_at",
      "item_views.open_count",
    ])
    .execute();
}

function _isEligibleMemberView(
  options: Readonly<{
    row: MemberView;
    item: VisibleItem;
    mode: string;
    expandedIds: ReadonlySet<string>;
  }>,
): boolean {
  const { row, item, mode, expandedIds } = options;
  if (row.status === "removed") {
    return row.first_opened_at !== null;
  }
  return (
    row.role === "admin" ||
    row.id === item.uploadedBy ||
    mode === "everyone" ||
    (mode === "only" ? expandedIds.has(row.id) : !expandedIds.has(row.id))
  );
}

function _makeViewerRowFromMemberView(
  row: Readonly<MemberView>,
): ItemViewerRow {
  return {
    member: {
      memberId: row.id,
      displayName: getDisplayNameFromMember({
        storedDisplayName: row.display_name ?? undefined,
        email: row.email,
      }),
    },
    hasOpened: row.first_opened_at !== null,
    firstSeenAt: row.first_seen_at,
    firstOpenedAt: row.first_opened_at,
    lastOpenedAt: row.last_opened_at,
    openCount: row.open_count ?? 0,
  };
}

/** Lists eligible members and retained removed-member open history. */
export async function readItemViewers(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    itemId: string;
  }>,
): Promise<ItemViewersResponse> {
  const item = await getVisibleItemOr404(options);
  if (!options.viewer.isAdmin) {
    throw ApiError.forbidden("presence_forbidden");
  }
  const rule = await options.database
    .selectFrom("visibility_rules")
    .select("mode")
    .where("id", "=", item.visibilityRuleId)
    .executeTakeFirstOrThrow();
  const expandedIds = await _getExpandedMemberIdsFromRule({
    database: options.database,
    ruleId: item.visibilityRuleId,
  });
  const rows = await _readMemberViewsFromItem(options);
  const viewers = rows
    .filter((row) => {
      return _isEligibleMemberView({ row, item, mode: rule.mode, expandedIds });
    })
    .map(_makeViewerRowFromMemberView)
    .sort(_compareViewerRows);
  return { viewers, nextCursor: null };
}
