import type { SetupInvitationDrafts } from "./setupFlow.types";
import { useState } from "react";
import {
  getInvitationRequestFromRow,
  makeInvitationRowFromId,
  type InvitationRow,
} from "./setupInvitationHelpers";

/** Validates the entire intended batch before allowing any server write. */
export function useSetupInvitationDrafts(): SetupInvitationDrafts {
  const [rows, setRows] = useState<InvitationRow[]>(() => {
    return [makeInvitationRowFromId(1)];
  });
  const getValidatedRows = () => {
    const validated = rows.map((row) => {
      if (row.isQueued) {
        return row;
      }
      const parsed = getInvitationRequestFromRow(row);
      return {
        ...row,
        error: parsed.success ? undefined : parsed.error.issues[0]?.message,
      };
    });
    setRows(validated);
    const invalidRow = validated.find((row) => {
      return row.error !== undefined;
    });
    if (invalidRow !== undefined) {
      document.getElementsByName(`email-${invalidRow.id}`)[0]?.focus();
      return undefined;
    }
    return validated;
  };
  return {
    rows,
    onQueued: setRows,
    getValidatedRows,
    onAdd: () => {
      return setRows([
        ...rows,
        makeInvitationRowFromId((rows.at(-1)?.id ?? 0) + 1),
      ]);
    },
    onChange: (id: number, updates: Partial<InvitationRow>) => {
      return setRows(
        rows.map((row) => {
          return row.id === id ? { ...row, ...updates, error: undefined } : row;
        }),
      );
    },
  };
}
