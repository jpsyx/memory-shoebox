/**
 * How long one video may take, start to finish, before it gets no poster.
 *
 * A codec this browser cannot decode usually fails fast with an `error`
 * event, but not always: some stall at `loadedmetadata` forever. Twenty
 * seconds is ten times the slowest poster the spike measured, the 533 MB file
 * on WebKit included, so only a video that was never going to decode meets it.
 */
export const POSTER_TIMEOUT_MS = 20_000;
