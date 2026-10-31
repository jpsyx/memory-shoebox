import type { PersonRef } from "@memory-shoebox/shared";

/** The name shown for a photo-tag identity. */
export function personLabel(person: Readonly<PersonRef>): string {
  return person.isMember
    ? person.displayName
    : `${person.displayName} (not a member)`;
}
