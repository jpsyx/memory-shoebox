/**
 * Where to land after a sign-in, taking only a path on this origin.
 *
 * `redirect` comes off the URL, so it is whatever somebody put there, and this
 * form is reached by people opening links other people sent them. This
 * function does not rely on anything downstream, such as the router,
 * normalising a hostile value afterwards: it checks the string itself and
 * accepts nothing that is not a plain path beginning with exactly one `/`.
 *
 * A second character of `/` or `\` both mean "somewhere else". A leading `//`
 * is a scheme-relative URL. A leading `/\` resolves identically: WHATWG URL
 * parsing folds a backslash into a forward slash for an http or https URL, so
 * `/\evil.example.com` reaches the same place `//evil.example.com` does. Both
 * are an open redirect dressed up as a deep link: sign in here, land
 * somewhere else, and the somewhere else looks like it was part of signing
 * in.
 *
 * Anything that fails this check falls back to the pile, which is where
 * sign-in lands anyway, so the failure mode is a person seeing their
 * photographs rather than an error.
 *
 * @param redirect The `redirect` search parameter, if there was one.
 * @returns A path on this origin, always.
 */
export function makeSafeHrefFromRedirect(redirect: string | undefined): string {
  if (redirect === undefined || !redirect.startsWith("/")) {
    return "/";
  }
  // A slash or a backslash in the second position both mean "somewhere
  // else". WHATWG URL parsing folds a backslash into a forward slash for an
  // http or https URL, so `/\evil.example.com` resolves exactly as
  // `//evil.example.com` does, and a check that only knew about `//` would
  // pass it straight through.
  const secondCharacter = redirect[1];
  return secondCharacter === "/" || secondCharacter === "\\" ? "/" : redirect;
}
