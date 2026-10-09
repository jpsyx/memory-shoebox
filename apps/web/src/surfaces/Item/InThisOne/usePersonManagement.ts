import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { itemQueryOptions } from "@/api/items/items";
import { deletePerson, renamePerson } from "@/api/items/personTagging";
import {
  makeWriteScopeFromItemId,
  markPileStale,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";

/** Management progress and commands for the menu and rename dialog. */
export type PersonManagement = {
  save: (edit: PersonEdit) => void;
  reset: () => void;
  isSaving: boolean;
  error: string | undefined;
};

import { updatePersonSuggestionCaches } from "./updatePersonSuggestionCaches";

type PersonEdit = { personId: string; displayName?: string };

/** A denied delete is actionable without exposing the other photographs. */
function _personManagementProblem(error: unknown): string | undefined {
  if (!error) {
    return undefined;
  }
  if (error instanceof ApiRequestError) {
    if (error.code === "person_used_elsewhere") {
      return "This person is tagged elsewhere and cannot be deleted.";
    }
    if (error.status === 403) {
      return "You no longer have permission to change this person.";
    }
    if (error.status === 404) {
      return "This person or photograph is no longer available.";
    }
  }
  return "That did not go through. Please try again.";
}

/** Serializes global person changes with pending saves on the current item. */
export function usePersonManagement(
  options: Readonly<{
    itemId: string;
    onSaved: (detail: ItemDetail, personId: string) => void;
  }>,
): PersonManagement {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ["items", options.itemId, "people", "manage"],
    scope: makeWriteScopeFromItemId(options.itemId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["people"] });
    },
    mutationFn: (edit: PersonEdit) => {
      const target = { itemId: options.itemId, personId: edit.personId };
      return edit.displayName === undefined
        ? deletePerson(target)
        : renamePerson({ ...target, displayName: edit.displayName });
    },
    onSuccess: (detail, edit) => {
      updatePersonSuggestionCaches({ queryClient, edit });
      queryClient.setQueryData(
        itemQueryOptions(options.itemId).queryKey,
        detail,
      );
      markPileStale(queryClient);
      void queryClient.invalidateQueries({
        queryKey: ["items"],
        refetchType: "none",
      });
      options.onSaved(detail, edit.personId);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["people"] });
    },
  });
  return {
    save: mutation.mutate,
    reset: mutation.reset,
    isSaving: mutation.isPending,
    error: _personManagementProblem(mutation.error),
  };
}
