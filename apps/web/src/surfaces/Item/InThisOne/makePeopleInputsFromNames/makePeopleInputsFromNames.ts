import type { PersonInput, PersonRef } from "@memory-shoebox/shared";

/**
 * The people set to send, from the names in the field.
 *
 * The field holds names, because it accepts one the archive has never heard
 * of. A name a known person carries goes as their id, so tagging "Mateo"
 * attaches the Mateo on 412 photographs rather than inventing a second one;
 * any other name goes as a name, and the server makes a person of it. The
 * first person carrying a name wins, and the caller lists the item's own
 * people first, so a name already on the item keeps the person it had.
 */
export function makePeopleInputsFromNames(
  options: Readonly<{
    names: readonly string[];
    known: readonly PersonRef[];
  }>,
): PersonInput[] {
  return options.names.map((name) => {
    const person = options.known.find((candidate) => {
      return candidate.displayName === name;
    });
    return person === undefined
      ? { displayName: name }
      : { personId: person.personId };
  });
}
