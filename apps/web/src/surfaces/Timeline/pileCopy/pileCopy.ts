import type { TimelineSelection } from "@/api/timeline/selection";
import { isSelectionActive } from "@/api/timeline/selection";

/** The words a filtered pile puts on its spine and in its strip. */

/** "Elena", "Elena and Mateo", "Elena, Mateo and Rosa". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

/**
 * The unit word beside a day's count, or nothing.
 *
 * **The person's own name, never a pronoun** (`timeline.md` Ruling 4). Nothing
 * in the schema knows anybody's gender and nothing should learn it for one
 * preposition, so the spine reads the name it is already filtered by. It also
 * happens to be clearer with several people chosen, which "with her" cannot be
 * at all.
 *
 * Undefined leaves `DaySpine` to say "photo" or "photos", which is right when
 * the pile is the whole archive.
 */
export function spineCountLabel(options: {
  selection: TimelineSelection;
  /** Display names by person id, from the facets row. */
  personNames: ReadonlyMap<string, string>;
}): string | undefined {
  const { selection, personNames } = options;
  if (!isSelectionActive(selection)) {
    return undefined;
  }
  const named = selection.people
    .map((personId) => {
      return personNames.get(personId);
    })
    .filter((name): name is string => {
      return name !== undefined;
    });
  // An id with no name yet means the facets row has not landed. "matching" is
  // right until it does, and printing a uuid never is.
  return named.length === 0 ? "matching" : `with ${nameList(named)}`;
}
