/**
 * Whether the member who just signed in had never signed in before.
 *
 * Module state, and that is the design rather than a shortcut. It is not a
 * server fact, so it does not belong in the query cache where something could
 * refetch it, and it is not durable, so it does not belong in
 * `sessionStorage` where a reload would bring it back. The line it drives is
 * shown once, on the way in from a redemption, and never again.
 */
let _isFirstSignIn = false;

/**
 * Records what `POST /api/auth/session` answered.
 *
 * @param isFirstSignIn `isFirstSignIn` off the `201`.
 */
export function setFirstSignIn(isFirstSignIn: boolean): void {
  _isFirstSignIn = isFirstSignIn;
}

/**
 * Reads the flag and clears it, so the line cannot be shown twice.
 *
 * @returns True on the one render after a first sign-in.
 */
export function takeFirstSignIn(): boolean {
  const wasFirstSignIn = _isFirstSignIn;
  _isFirstSignIn = false;
  return wasFirstSignIn;
}
