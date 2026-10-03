/** The part of a Playwright page the watch needs. */
type WatchedPage = {
  mainFrame: () => unknown;
  on: (event: "framenavigated", listener: (frame: unknown) => void) => unknown;
  off: (event: "framenavigated", listener: (frame: unknown) => void) => unknown;
};

/**
 * Watches the harness page for a navigation or reload of its main frame.
 *
 * The harness keeps its whole run in the page, so a reload (the dev server
 * re-optimising a dependency, or reloading on a file change) throws it away,
 * and `waitForFunction` would then wait, without a limit, for a run that is
 * gone. Race `navigated` against the wait and the run fails instead.
 *
 * Start it only after the page has loaded: its first load is a navigation too.
 *
 * @returns `navigated`, which rejects on the first main-frame navigation and
 *   never resolves; and `stop`, which stops listening. Call `stop` when the
 *   wait is over so that nothing rejects later.
 */
export function watchForMainFrameNavigation(page: WatchedPage): {
  navigated: Promise<never>;
  stop: () => void;
} {
  let listener: (frame: unknown) => void = () => {};
  const navigated = new Promise<never>((_resolve, reject) => {
    listener = (frame) => {
      if (frame === page.mainFrame()) {
        reject(
          new Error(
            "The harness page navigated or reloaded after the files were picked, which resets its state, so this run cannot be read. The dev server most likely reloaded it (a re-optimised dependency or an edited file): start again.",
          ),
        );
      }
    };
    page.on("framenavigated", listener);
  });
  // Rejecting before anyone has awaited it is not an unhandled rejection: the
  // caller's race still sees the rejection.
  navigated.catch(() => {});
  return {
    navigated,
    stop: () => {
      page.off("framenavigated", listener);
    },
  };
}
