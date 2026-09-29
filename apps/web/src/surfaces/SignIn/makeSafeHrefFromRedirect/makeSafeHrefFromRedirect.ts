/**
 * Where to land after a sign-in, refusing anywhere but this origin.
 *
 * `redirect` comes off the URL, so it is whatever somebody put there, and this
 * form is reached by people opening links other people sent them. A value
 * beginning `//`, or naming a scheme, is an open redirect dressed up as a deep
 * link: sign in here, land somewhere else, and the somewhere else looks like
 * it was part of signing in.
 *
 * Anything that is not a plain path on this origin falls back to the pile,
 * which is where sign-in lands anyway, so the failure mode is a person seeing
 * their photographs rather than an error.
 *
 * @param redirect The `redirect` search parameter, if there was one.
 * @returns A path on this origin, always.
 */
export function makeSafeHrefFromRedirect(redirect: string | undefined): string {
  return redirect !== undefined &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//")
    ? redirect
    : "/";
}
