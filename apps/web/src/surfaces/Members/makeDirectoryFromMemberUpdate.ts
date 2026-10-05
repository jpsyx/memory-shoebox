import type {
  AdminMemberDto,
  ListMembersResponse,
} from "@memory-shoebox/shared";

/**
 * Applies the committed member response before refreshing the live directory.
 */
export function makeDirectoryFromMemberUpdate(
  options: Readonly<{
    directory: ListMembersResponse | undefined;
    member: AdminMemberDto;
  }>,
): ListMembersResponse | undefined {
  const { directory, member } = options;
  if (directory === undefined || directory.shape !== "admin") {
    return directory;
  }
  const members =
    member.status === "removed"
      ? directory.members.filter((candidate) => {
          return candidate.memberId !== member.memberId;
        })
      : directory.members.some((candidate) => {
            return candidate.memberId === member.memberId;
          })
        ? directory.members.map((candidate) => {
            return candidate.memberId === member.memberId ? member : candidate;
          })
        : [...directory.members, member];
  const activeAdminCount = members.filter((candidate) => {
    return candidate.status === "active" && candidate.role === "admin";
  }).length;
  return {
    ...directory,
    activeAdminCount,
    members: members.map((candidate) => {
      return {
        ...candidate,
        isLastActiveAdmin:
          candidate.status === "active" &&
          candidate.role === "admin" &&
          activeAdminCount === 1,
      };
    }),
  };
}
