import type {
  MemberRef,
  ResolveVisibilityRuleRequest,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import type { GroupsResponse } from "@/api/groups/groups";
import type { MembersResponse } from "@/api/members/members";
import type {
  PeopleFieldGroup,
  PeopleFieldMember,
} from "@/system/PeopleField/PeopleField";
import type { VisibilityMode } from "@/system/VisibilityControl/VisibilityControl";

/** Everything the visibility picker can offer. */
export type PickerOptions = {
  members: PeopleFieldMember[];
  groups: PeopleFieldGroup[];
};

/** Where the picker's options come from. */
type PickerSources = {
  members: MembersResponse | undefined;
  groups: GroupsResponse | undefined;
  visibility: VisibilitySummary;
  viewer: MemberRef;
};

/** The first of each id, in order. */
function _uniqueBy<T>(items: readonly T[], idOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = idOf(item);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

/** The fetched groups, sized where the admin shape lets them be. */
function _groupsFrom(groups: GroupsResponse | undefined): PeopleFieldGroup[] {
  if (groups === undefined) {
    return [];
  }
  return groups.shape === "admin"
    ? groups.groups.map((group) => {
        return {
          groupId: group.groupId,
          name: group.name,
          memberCount: group.members.length,
        };
      })
    : groups.groups.map((group) => {
        return { groupId: group.groupId, name: group.name };
      });
}

/**
 * Who the picker offers: the fetched lists, then the item's own subjects, then
 * the viewer, the first of each id winning.
 *
 * The fetched rows go first because they know more (a role, a size). The
 * rule's subjects carry their names, so a rule can always be edited down even
 * while `GET /api/members` and `GET /api/groups` answer `404` before step 8a
 * (decision 8); the viewer is there so "Only me" always works.
 */
export function makePickerOptionsFromSources(
  options: Readonly<PickerSources>,
): PickerOptions {
  const { visibility, viewer } = options;
  const namedMembers = visibility.subjects
    .filter((subject) => {
      return subject.kind === "member";
    })
    .map((subject) => {
      return { memberId: subject.id, displayName: subject.displayName };
    });
  const namedGroups = visibility.subjects
    .filter((subject) => {
      return subject.kind === "group";
    })
    .map((subject) => {
      return { groupId: subject.id, name: subject.displayName };
    });
  return {
    members: _uniqueBy<PeopleFieldMember>(
      [
        ...(options.members?.members ?? []),
        ...namedMembers,
        { memberId: viewer.memberId, displayName: viewer.displayName },
      ],
      (member) => {
        return member.memberId;
      },
    ),
    groups: _uniqueBy(
      [..._groupsFrom(options.groups), ...namedGroups],
      (group) => {
        return group.groupId;
      },
    ),
  };
}

/** One rule as a comparable string, Except-with-nobody read as Everyone. */
function _canonicalRule(
  options: Readonly<{
    mode: VisibilityMode;
    subjectIds: readonly string[];
  }>,
): string {
  const { mode, subjectIds } = options;
  return mode === "everyone" || (mode === "except" && subjectIds.length === 0)
    ? "everyone"
    : `${mode}:${[...subjectIds].sort().join(",")}`;
}

/**
 * Whether a choice is the rule the item already has, so Save can close with
 * no request at all. "Except nobody" is the seeded everyone rule on the
 * server (`items.md` § `POST /api/visibility-rules/resolve`, step 4), so it
 * is here too.
 */
export function isSameVisibility(
  options: Readonly<{
    visibility: VisibilitySummary;
    mode: VisibilityMode;
    subjectIds: readonly string[];
  }>,
): boolean {
  return (
    _canonicalRule({ mode: options.mode, subjectIds: options.subjectIds }) ===
    _canonicalRule({
      mode: options.visibility.mode,
      subjectIds: options.visibility.subjects.map((subject) => {
        return subject.id;
      }),
    })
  );
}

/**
 * The resolve request for a choice, each subject's kind read off the groups.
 */
export function makeResolveRequestFromChoice(
  options: Readonly<{
    mode: VisibilityMode;
    subjectIds: readonly string[];
    groups: readonly PeopleFieldGroup[];
  }>,
): ResolveVisibilityRuleRequest {
  if (options.mode === "everyone") {
    return { mode: "everyone", subjects: [] };
  }
  const groupIds = new Set(
    options.groups.map((group) => {
      return group.groupId;
    }),
  );
  return {
    mode: options.mode,
    subjects: options.subjectIds.map((id) => {
      return { kind: groupIds.has(id) ? "group" : "member", id };
    }),
  };
}
