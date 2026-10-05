import type { CreateSetupRequest } from "@memory-shoebox/shared";
import type { SetupFieldErrors, SetupFields } from "./setupFormHelpers";
import type { InvitationRow } from "./setupInvitationHelpers";

/** Local setup values, labelled failures and permanent-address review. */
export type SetupDraft = {
  fields: SetupFields;
  errors: SetupFieldErrors;
  review: CreateSetupRequest | undefined;
  onInvalid: (errors: Readonly<SetupFieldErrors>) => void;
  onChange: (
    options: Readonly<{ field: keyof SetupFields; value: string }>,
  ) => void;
  onEdit: () => void;
  onReviewed: (body: Readonly<CreateSetupRequest>) => void;
};
/** Draft state and the one reviewed first-admin creation action. */
export type SetupCreation = SetupDraft & {
  create: (body: Readonly<CreateSetupRequest>) => void;
  isPending: boolean;
  error: string | undefined;
  onSubmit: () => void;
};
/** Local rows and validation, separate from server invitation mutations. */
export type SetupInvitationDrafts = {
  rows: InvitationRow[];
  onQueued: (rows: readonly InvitationRow[]) => void;
  getValidatedRows: () => InvitationRow[] | undefined;
  onAdd: () => void;
  onChange: (
    options: Readonly<{
      id: number;
      updates: Readonly<Partial<InvitationRow>>;
    }>,
  ) => void;
};
/** The invitation surface's meaningful actions and pending state. */
export type SetupInvitationsFlow = Pick<
  SetupInvitationDrafts,
  "rows" | "onAdd" | "onChange"
> & {
  isBusy: boolean;
  onSubmit: () => void;
  onSkip: () => void;
  completionError: string | undefined;
};
