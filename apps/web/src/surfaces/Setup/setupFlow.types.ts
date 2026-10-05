import type { CreateSetupRequest } from "@memory-shoebox/shared";
import type { SetupFields, SetupFieldErrors } from "./setupFormHelpers";
import type { InvitationRow } from "./setupInvitationHelpers";

/** Local setup values, labelled failures and permanent-address review. */
export type SetupDraft = {
  fields: SetupFields;
  errors: SetupFieldErrors;
  review: CreateSetupRequest | undefined;
  onInvalid: (errors: SetupFieldErrors) => void;
  onChange: (field: keyof SetupFields, value: string) => void;
  onEdit: () => void;
  onReviewed: (body: CreateSetupRequest) => void;
};
/** Draft state and the one reviewed first-admin creation action. */
export type SetupCreation = SetupDraft & {
  create: (body: CreateSetupRequest) => void;
  isPending: boolean;
  error: string | undefined;
  onSubmit: () => void;
};
/** Local rows and validation, separate from server invitation mutations. */
export type SetupInvitationDrafts = {
  rows: InvitationRow[];
  onQueued: (rows: InvitationRow[]) => void;
  getValidatedRows: () => InvitationRow[] | undefined;
  onAdd: () => void;
  onChange: (id: number, updates: Partial<InvitationRow>) => void;
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
