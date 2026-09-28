/**
 * The three standings a member of a Shoebox can hold.
 *
 * Declared once as a runtime array so `PeopleField`'s option line, the
 * product bar, and the signed-in viewer's own record all read the same three
 * words rather than each retyping the union.
 */
export const MEMBER_ROLES = ["viewer", "uploader", "admin"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];
