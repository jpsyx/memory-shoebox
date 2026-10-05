import { useState, type Dispatch, type SetStateAction } from "react";
import type { SetupInvitationDrafts } from "../../setupFlow.types";
import {
  makeInvitationRequestValidationFromRow,
  makeInvitationRowFromId,
  type InvitationRow,
} from "../../setupInvitationHelpers";

function _validateInvitationRows(
  options: Readonly<{
    rows: readonly InvitationRow[];
    setRows: Dispatch<SetStateAction<InvitationRow[]>>;
  }>,
): InvitationRow[] | undefined {
  const validated = options.rows.map((row) => {
    if (row.isQueued) {
      return row;
    }
    const parsed = makeInvitationRequestValidationFromRow(row);
    const issue = parsed.success ? undefined : parsed.error.issues[0];
    return {
      ...row,
      error: issue?.message,
      errorField:
        issue?.path[0] === "displayName"
          ? ("displayName" as const)
          : issue === undefined
            ? undefined
            : ("email" as const),
    };
  });
  options.setRows(validated);
  const invalidRow = validated.find((row) => {
    return row.error !== undefined;
  });
  if (invalidRow !== undefined) {
    document
      .getElementsByName(`${invalidRow.errorField}-${invalidRow.id}`)[0]
      ?.focus();
    return undefined;
  }
  return validated;
}

/** Returns local invitation drafts and whole-batch validation actions. */
export function useSetupInvitationDrafts(): SetupInvitationDrafts {
  const [rows, setRows] = useState<InvitationRow[]>(() => {
    return [makeInvitationRowFromId(1)];
  });
  return {
    rows,
    onQueued: (queuedRows) => {
      return setRows([...queuedRows]);
    },
    getValidatedRows: () => {
      return _validateInvitationRows({ rows, setRows });
    },
    onAdd: () => {
      return setRows([
        ...rows,
        makeInvitationRowFromId((rows.at(-1)?.id ?? 0) + 1),
      ]);
    },
    onChange: ({ id, updates }) => {
      return setRows(
        rows.map((row) => {
          return row.id === id
            ? { ...row, ...updates, error: undefined, errorField: undefined }
            : row;
        }),
      );
    },
  };
}
