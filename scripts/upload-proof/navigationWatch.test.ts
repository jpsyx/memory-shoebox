import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { watchForMainFrameNavigation } from "./navigationWatch";

/** A page that can navigate, with a main frame and a child frame. */
function _makePage(): {
  page: Parameters<typeof watchForMainFrameNavigation>[0];
  emitter: EventEmitter;
  mainFrame: object;
  childFrame: object;
} {
  const emitter = new EventEmitter();
  const mainFrame = { name: "main" };
  return {
    page: {
      mainFrame: () => {
        return mainFrame;
      },
      on: (event, listener) => {
        return emitter.on(event, listener);
      },
      off: (event, listener) => {
        return emitter.off(event, listener);
      },
    },
    emitter,
    mainFrame,
    childFrame: { name: "child" },
  };
}

describe("watchForMainFrameNavigation", () => {
  it("rejects when the main frame navigates or reloads, which resets the harness", async () => {
    const { emitter, mainFrame, page } = _makePage();
    const watch = watchForMainFrameNavigation(page);

    emitter.emit("framenavigated", mainFrame);

    await expect(watch.navigated).rejects.toThrow(
      /navigated or reloaded after the files were picked/,
    );
  });

  it("ignores a child frame, and stops listening when stopped", async () => {
    const { childFrame, emitter, mainFrame, page } = _makePage();
    const watch = watchForMainFrameNavigation(page);

    emitter.emit("framenavigated", childFrame);
    watch.stop();
    emitter.emit("framenavigated", mainFrame);

    expect(emitter.listenerCount("framenavigated")).toBe(0);
    await expect(
      Promise.race([
        watch.navigated,
        new Promise((settle) => {
          setTimeout(() => {
            settle("still waiting");
          }, 20);
        }),
      ]),
    ).resolves.toBe("still waiting");
  });
});
