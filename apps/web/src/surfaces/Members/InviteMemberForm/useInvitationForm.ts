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
  hasSent: boolean;
  failure: string | undefined;
  errors: InvitationFieldErrors;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Owns validation and retains the draft when an invitation is refused. */
export function useInvitationForm(
  onSent: (email: string) => void,
): InvitationFormState {
  const [hasSent, setHasSent] = useState(false);
  const draft = useInvitationDraft();
  const [role, onRole] = useState<MemberRole>("viewer");
  const [localErrors, setLocalErrors] = useState<InvitationFieldErrors>({});
  const mutation = useMemberMutation({
    onSaved: (action) => {
      if (action.kind === "invite") {
        setHasSent(true);
        onSent(action.body.email);
      }
    },
  });
  const onSubmit = _getSubmitHandlerFromInvitation({
    draft,
    role,
    mutation,
    hasSent,
    setLocalErrors,
  });
  const errors = makeInvitationFieldErrorsFromFailures({
    localErrors,
    serverError: mutation.error,
  });
  return {
    draft,
    hasSent,
    role,
    onRole,
    onSubmit,
    errors,
    isPending: mutation.isPending,
    failure:
      mutation.error === null ? undefined : memberFailure(mutation.error),
  };
}

function _getSubmitHandlerFromInvitation({
  draft,
  role,
  mutation,
  hasSent,
  setLocalErrors,
}: Readonly<{
  draft: ReturnType<typeof useInvitationDraft>;
  role: MemberRole;
  mutation: ReturnType<typeof useMemberMutation>;
  hasSent: boolean;
  setLocalErrors: (errors: InvitationFieldErrors) => void;
}>): (event: FormEvent<HTMLFormElement>) => void {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending || hasSent) {
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
}
