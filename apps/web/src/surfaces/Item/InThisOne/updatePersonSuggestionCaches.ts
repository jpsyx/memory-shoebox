import type { QueryClient } from "@tanstack/react-query";
import {
  peopleResponseSchema,
  personTaggingOptionsResponseSchema,
  type PersonRef,
} from "@memory-shoebox/shared";

type PersonEdit = { personId: string; displayName?: string };

/** Updates the changed identity while leaving other suggestion metadata intact. */
function _getEntriesAfterPersonEdit<T extends { person: PersonRef }>(
  options: Readonly<{ entries: readonly T[]; edit: PersonEdit }>,
): T[] {
  return options.entries.flatMap((entry) => {
    if (entry.person.personId !== options.edit.personId) {
      return [entry];
    }
    return options.edit.displayName === undefined
      ? []
      : [
          {
            ...entry,
            person: { ...entry.person, displayName: options.edit.displayName },
          },
        ];
  });
}

/** Reconciles suggestions immediately, including when the next read fails. */
export function updatePersonSuggestionCaches(
  options: Readonly<{ queryClient: QueryClient; edit: PersonEdit }>,
): void {
  options.queryClient
    .getQueriesData({ queryKey: ["people"] })
    .forEach(([key, data]) => {
      const directory = peopleResponseSchema.safeParse(data);
      if (directory.success) {
        options.queryClient.setQueryData(key, {
          ...directory.data,
          people: _getEntriesAfterPersonEdit({
            entries: directory.data.people,
            edit: options.edit,
          }),
          peopleCount: Math.max(
            0,
            directory.data.peopleCount -
              (options.edit.displayName === undefined ? 1 : 0),
          ),
        });
        return;
      }
      const tagging = personTaggingOptionsResponseSchema.safeParse(data);
      if (tagging.success) {
        options.queryClient.setQueryData(key, {
          ...tagging.data,
          people: _getEntriesAfterPersonEdit({
            entries: tagging.data.people,
            edit: options.edit,
          }),
        });
      }
    });
}
