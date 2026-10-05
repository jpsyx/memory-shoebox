import { Button, Modal, Stack } from "@mantine/core";
import type { AdminMemberDto, MemberRole } from "@memory-shoebox/shared";
import { useState, type ReactNode } from "react";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { MemberActionBody } from "@/surfaces/Members/MemberActionDialog/MemberActionBody";
import {
  isLastActiveAdmin,
  memberFailure,
  memberFieldError,
} from "@/surfaces/Members/memberCopy";
import {
  useMemberMutation,
  type MemberAction,
} from "@/surfaces/Members/useMemberMutation";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Banner } from "@/system/Chrome/Banner";

type Props = {
  action: Exclude<MemberAction, { kind: "invite" }>;
  members: readonly AdminMemberDto[];
  onClose: () => void;
};
/** Protected-focus confirmations retain selected values when the server refuses. */
export function MemberActionDialog({
  action,
  members,
  onClose,
}: Readonly<Props>): ReactNode {
  const [role, setRole] = useState<MemberRole>(action.member.role);
  const mutation = useMemberMutation({ onSaved: onClose });
  const member =
    members.find((candidate) => {
      return candidate.memberId === action.member.memberId;
    }) ?? action.member;
  const isProtected =
    isLastActiveAdmin({ member, members }) &&
    (action.kind === "remove" || (action.kind === "role" && role !== "admin"));
  const title =
    action.kind === "role"
      ? `What can ${member.displayName} do?`
      : action.kind === "remove"
        ? `Remove ${member.displayName}?`
        : action.kind === "revoke"
          ? `Revoke ${member.displayName}'s invitation?`
          : "Sign this device out?";
  const button =
    action.kind === "role"
      ? "Save"
      : action.kind === "remove"
        ? "Remove them"
        : action.kind === "revoke"
          ? "Revoke invitation"
          : action.kind === "device" && action.session.isCurrent
            ? "Sign out here"
            : "Sign it out";
  const onConfirm = () => {
    if (isProtected || mutation.isPending) {
      return;
    }
    mutation.mutate(action.kind === "role" ? { ...action, role } : action);
  };
  return (
    <Modal
      opened
      onClose={() => {
        if (!mutation.isPending) {
          onClose();
        }
      }}
      title={title}
      closeOnClickOutside={!mutation.isPending}
      closeOnEscape={!mutation.isPending}
      withCloseButton={!mutation.isPending}
    >
      <Stack gap="md">
        <MemberActionBody
          action={action}
          role={role}
          onRole={setRole}
          isPending={mutation.isPending}
          error={memberFieldError({
            details:
              mutation.error instanceof ApiRequestError
                ? mutation.error.details
                : undefined,
            field: "role",
          })}
        />
        {isProtected ? (
          <Banner>
            This is the only active admin. Make somebody else an active admin
            first.
          </Banner>
        ) : null}
        {mutation.error === null ? null : (
          <div role="alert">
            <Banner>{memberFailure(mutation.error)}</Banner>
          </div>
        )}
        <ChipRow>
          <Button
            variant={action.kind === "role" ? "filled" : "danger"}
            disabled={isProtected}
            loading={mutation.isPending}
            onClick={onConfirm}
          >
            {button}
          </Button>
          <Button
            variant="default"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
        </ChipRow>
      </Stack>
    </Modal>
  );
}
