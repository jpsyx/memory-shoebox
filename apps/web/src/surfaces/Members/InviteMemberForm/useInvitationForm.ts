import type { MemberRole } from "@memory-shoebox/shared";
import { useState, type FormEvent } from "react";
import { useInvitationDraft } from "@/surfaces/Members/InviteMemberForm/useInvitationDraft";
import {
  makeInvitationSubmissionFromDraft,
  makeInvitationFieldErrorsFromFailures,
  type InvitationFieldErrors,
} from "@/surfaces/Members/InviteMemberForm/invitationFormHelpers";
import { memberFailure } from "@/surfaces/Members/memberCopy";
import { useMemberMutation } from "@/surfaces/Members/useMemberMutation";

/** The invitation's editable values, submission lifecycle and named errors. */
export type InvitationFormState = {
  draft: ReturnType<typeof useInvitationDraft>;
  role: MemberRole;
  onRole: (role: MemberRole) => void;
  isPending: boolean;
  failure: string | undefined;
  errors: InvitationFieldErrors;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Owns validation and retains the draft when an invitation is refused. */
export function useInvitationForm(
  onSent: (email: string) => void,
): InvitationFormState {
  const draft = useInvitationDraft();
  const [role, onRole] = useState<MemberRole>("viewer");
  const [localErrors, setLocalErrors] = useState<InvitationFieldErrors>({});
  const mutation = useMemberMutation({
    onSaved: (action) => {
      if (action.kind === "invite") {
        onSent(action.body.email);
      }
    },
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) {
      return;
    }
    const submission = makeInvitationSubmissionFromDraft({
      email: draft.email,
      displayName: draft.displayName.trim() || undefined,
      role,
    });
    setLocalErrors(submission.errors);
    if (submission.body !== undefined) {
      mutation.mutate({ kind: "invite", body: submission.body });
    }
  };
  const errors = makeInvitationFieldErrorsFromFailures({
    localErrors,
    serverError: mutation.error,
  });
  return {
    draft,
    role,
    onRole,
    onSubmit,
    errors,
    isPending: mutation.isPending,
    failure:
      mutation.error === null ? undefined : memberFailure(mutation.error),
  };
}
