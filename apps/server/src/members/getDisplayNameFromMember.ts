/**
 * The name the rest of the product shows for a member.
 *
 * `members.display_name` is set by whoever invited them and is correctable
 * by the member, and it **falls back to the email local part** when it is
 * null (`data-models.md` § `members`, Decision 1). The raw column travels
 * beside this in `MeDto` as `storedDisplayName`, so the account form can show
 * the fallback as a placeholder rather than as text somebody appears to have
 * typed.
 *
 * @param options.storedDisplayName The raw `display_name` column, or
 *   undefined when the member has none set.
 * @param options.email The member's address.
 */
export function getDisplayNameFromMember(options: {
  storedDisplayName: string | undefined;
  email: string;
}): string {
  const stored = options.storedDisplayName?.trim() ?? "";
  if (stored !== "") {
    return stored;
  }
  const [localPart] = options.email.split("@");
  return localPart === undefined || localPart === ""
    ? options.email
    : localPart;
}
