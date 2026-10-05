import { useState } from "react";
import type { AdminGroupDto } from "@memory-shoebox/shared";
/** Draft membership and name retain the server's successfully committed rename. */
export function useGroupDraft(
  group: Readonly<AdminGroupDto> | undefined,
): GroupDraftState {
  const [committed, setCommitted] = useState(group);
  const [name, setName] = useState(group?.name ?? "");
  const [memberIds, setMemberIds] = useState<readonly string[]>(
    group?.members.map((member) => {
      return member.memberId;
    }) ?? [],
  );
  const [savedName, setSavedName] = useState<string>();
  const onRenamed = (renamed: AdminGroupDto) => {
    setCommitted(renamed);
    setSavedName(renamed.name);
  };
  return {
    committed,
    name,
    setName,
    memberIds,
    setMemberIds,
    savedName,
    onRenamed,
  };
}

/** Controlled values and setters shared by creation and editing. */
export type GroupDraftState = {
  committed: AdminGroupDto | undefined;
  name: string;
  setName: (name: string) => void;
  memberIds: readonly string[];
  setMemberIds: (memberIds: readonly string[]) => void;
  savedName: string | undefined;
  onRenamed: (group: AdminGroupDto) => void;
};
