import {
  inviteMemberRequestSchema,
  LIMITS,
  type InviteMemberRequest,
} from "@memory-shoebox/shared";

import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { memberFieldError } from "@/surfaces/Members/memberCopy";

/** Validation attached to the three invitation controls. */
export type InvitationFieldErrors = {
  email?: string;
  displayName?: string;
  role?: string;
};

/** Maps schema failures to their own control and preserves normalized success. */
export function makeInvitationSubmissionFromDraft(
  body: Readonly<InviteMemberRequest>,
): {
  body: InviteMemberRequest | undefined;
  errors: InvitationFieldErrors;
} {
  const parsed = inviteMemberRequestSchema.safeParse(body);
  if (parsed.success) {
    return { body: parsed.data, errors: {} };
  }
  const fields = new Set(
    parsed.error.issues.map((issue) => {
      return issue.path[0];
    }),
  );
  return {
    body: undefined,
    errors: {
      email: fields.has("email") ? "Enter a valid email address." : undefined,
      displayName: fields.has("displayName")
        ? `Use ${LIMITS.memberDisplayNameMaxLength} characters or fewer.`
        : undefined,
      role: fields.has("role") ? "Choose a role." : undefined,
    },
  };
}

/** Combines local and server failures without attaching them to another field. */
export function makeInvitationFieldErrorsFromFailures(
  options: Readonly<{
    localErrors: InvitationFieldErrors;
    serverError: Error | null;
  }>,
): InvitationFieldErrors {
  const details =
    options.serverError instanceof ApiRequestError
      ? options.serverError.details
      : undefined;
  return Object.fromEntries(
    (["email", "displayName", "role"] as const).map((field) => {
      return [
        field,
        options.localErrors[field] ?? memberFieldError({ details, field }),
      ];
    }),
  );
}
