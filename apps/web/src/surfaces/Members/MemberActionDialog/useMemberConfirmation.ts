import type { AdminMemberDto, MemberRole } from "@memory-shoebox/shared";
import { useState } from "react";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  isLastActiveAdmin,
  memberFailure,
  memberFieldError,
} from "@/surfaces/Members/memberCopyHelpers";
import {
  useMemberMutation,
  type MemberAction,
} from "@/surfaces/Members/useMemberMutation";

/** A confirmation's editable selection, safeguards and submission lifecycle. */
export type MemberConfirmationState = {
  role: MemberRole;
  onRole: (role: MemberRole) => void;
  isPending: boolean;
  isProtected: boolean;
  fieldError: string | undefined;
  failure: string | undefined;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Holds chosen authority and protects confirmation and close during a write.
 */
export function useMemberConfirmation(
  options: Readonly<{
    action: Exclude<MemberAction, { kind: "invite" }>;
    members: readonly AdminMemberDto[];
    onClose: () => void;
  }>,
): MemberConfirmationState {
  const { action, members, onClose } = options;
  const [role, onRole] = useState<MemberRole>(action.member.role);
  const mutation = useMemberMutation({ onSaved: onClose });
  const member =
    members.find((candidate) => {
      return candidate.memberId === action.member.memberId;
    }) ?? action.member;
  const isProtected =
    isLastActiveAdmin({ member, members }) &&
    (action.kind === "remove" || (action.kind === "role" && role !== "admin"));
  const onConfirm = () => {
    if (!isProtected && !mutation.isPending) {
      mutation.mutate(action.kind === "role" ? { ...action, role } : action);
    }
  };
  const onSafeClose = () => {
    if (!mutation.isPending) {
      onClose();
    }
  };
  return {
    role,
    onRole,
    onConfirm,
    onClose: onSafeClose,
    isPending: mutation.isPending,
    isProtected,
    fieldError: memberFieldError({
      details:
        mutation.error instanceof ApiRequestError
          ? mutation.error.details
          : undefined,
      field: "role",
    }),
    failure:
      mutation.error === null ? undefined : memberFailure(mutation.error),
  };
}
