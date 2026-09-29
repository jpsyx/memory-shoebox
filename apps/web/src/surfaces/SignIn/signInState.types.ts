/**
 * The states surface 1 can be in.
 *
 * **Six, not the seven the design spec's surface table lists.** `unknown` is
 * not one: `POST /api/auth/sign-in-codes` answers the same `202` for a member
 * and for an address nobody has heard of, so the client cannot compute the
 * difference and must never appear to. The conditional wording below is the
 * only correct copy for every outcome of that route (`auth.md`, "The copy
 * correction this route forces").
 */
export type SignInState =
  | "link"
  | "email"
  | "sent"
  | "wrong"
  | "expired"
  | "resent";
