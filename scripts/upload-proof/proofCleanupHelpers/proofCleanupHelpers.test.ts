import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  createProofCleanup,
  installProofSignalHandlers,
} from "./proofCleanupHelpers";

/** Result for _setUp. */
type SetUpResult = {
  source: EventEmitter;
  ran: string[];
  exitCodes: number[];
  messages: string[];
  install: () => () => void;
  release: () => void;
  clock: { now: number };
};

describe("createProofCleanup", () => {
  it("runs the steps last in, first out, and only once", async () => {
    const ran: string[] = [];
    const cleanup = createProofCleanup();
    cleanup.add(() => {
      ran.push("session");
    });
    cleanup.add(async () => {
      await Promise.resolve();
      ran.push("browser");
    });

    expect(await cleanup.run()).toEqual([]);
    expect(await cleanup.run()).toEqual([]);
    expect(ran).toEqual(["browser", "session"]);
  });

  it("goes on past a step that throws, and says which one failed", async () => {
    const ran: string[] = [];
    const cleanup = createProofCleanup();
    cleanup.add(() => {
      ran.push("session");
    });
    cleanup.add(() => {
      throw new Error("browser would not close");
    });

    expect(await cleanup.run()).toEqual(["browser would not close"]);
    expect(ran).toEqual(["session"]);
  });

  it("hands everyone who asks the one run, so a signal and the end of the script wait for each other", async () => {
    let releaseStep: () => void = () => {};
    const gate = new Promise<void>((settle) => {
      releaseStep = settle;
    });
    const cleanup = createProofCleanup();
    cleanup.add(() => {
      return gate;
    });

    const first = cleanup.run();
    const second = cleanup.run();
    releaseStep();

    expect(await first).toEqual([]);
    expect(await second).toEqual([]);
  });
});

describe("installProofSignalHandlers", () => {
  // A signal source, the way `process` is one, and what the handler did.
  const _setUp = (): SetUpResult => {
    const source = new EventEmitter();
    const ran: string[] = [];
    const exitCodes: number[] = [];
    const messages: string[] = [];
    const clock = { now: 0 };
    let release: () => void = () => {};
    const browserGate = new Promise<void>((settle) => {
      release = settle;
    });
    const cleanup = createProofCleanup();
    cleanup.add(() => {
      ran.push("session");
    });
    cleanup.add(async () => {
      await browserGate;
      ran.push("browser");
    });
    return {
      source,
      ran,
      exitCodes,
      messages,
      clock,
      install: () => {
        return installProofSignalHandlers({
          cleanup,
          signalSource: source,
          exit: (code) => {
            exitCodes.push(code);
          },
          writeLine: (text) => {
            messages.push(text);
          },
          now: () => {
            return clock.now;
          },
        });
      },
      release: () => {
        release();
      },
    };
  };

  it("on Ctrl-C closes the browser, deletes the session, then exits non-zero", async () => {
    const { exitCodes, install, messages, ran, release, source } = _setUp();
    install();

    source.emit("SIGINT");
    expect(exitCodes).toEqual([]);
    release();
    await new Promise((settle) => {
      setImmediate(settle);
    });

    expect(ran).toEqual(["browser", "session"]);
    expect(exitCodes).toEqual([130]);
    expect(messages).toEqual([
      "Interrupted (SIGINT): closing the browser and ending the session.",
    ]);
  });

  it.each([
    ["SIGTERM", 143],
    ["SIGHUP", 129],
  ] as const)("exits on %s with status %i", async (signal, code) => {
    const { exitCodes, install, release, source } = _setUp();
    install();

    source.emit(signal);
    release();
    await new Promise((settle) => {
      setImmediate(settle);
    });

    expect(exitCodes).toEqual([code]);
  });

  it("takes a repeat within a second for the same Ctrl-C, which tsx relays after the terminal sent it", async () => {
    const { clock, exitCodes, install, ran, release, source } = _setUp();
    install();

    source.emit("SIGINT");
    clock.now = 40;
    source.emit("SIGINT");

    expect(exitCodes).toEqual([]);
    release();
    await new Promise((settle) => {
      setImmediate(settle);
    });
    expect(ran).toEqual(["browser", "session"]);
    expect(exitCodes).toEqual([130]);
  });

  it("exits at once on a deliberate second signal, when the cleanup is stuck", () => {
    const { clock, exitCodes, install, ran, source } = _setUp();
    install();

    source.emit("SIGINT");
    clock.now = 2500;
    source.emit("SIGINT");

    expect(exitCodes).toEqual([130]);
    expect(ran).toEqual([]);
  });

  it("stops listening when uninstalled", () => {
    const { install, source } = _setUp();
    const uninstall = install();

    uninstall();

    expect(source.listenerCount("SIGINT")).toBe(0);
    expect(source.listenerCount("SIGTERM")).toBe(0);
    expect(source.listenerCount("SIGHUP")).toBe(0);
  });
});
