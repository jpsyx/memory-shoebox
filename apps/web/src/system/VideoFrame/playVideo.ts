/**
 * Starts playback and swallows the refusal.
 *
 * An autoplay policy, or a file that never loaded, rejects `play()`; neither
 * is worth an error, because the frame still shows where the transport
 * stands. `Promise.resolve` is there because jsdom's `play()` returns nothing
 * at all rather than a promise, and a bare `.catch` on that would throw.
 */
export function playVideo(video: HTMLVideoElement): void {
  void Promise.resolve(video.play()).catch(() => {
    // Refused. The transport still stands where it was asked to.
  });
}
