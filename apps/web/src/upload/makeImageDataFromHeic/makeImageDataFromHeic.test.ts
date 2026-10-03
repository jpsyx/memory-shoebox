import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The factory libheif's glue exports, which each test gives a runtime. */
const libheif = vi.hoisted(() => {
  return { createModule: vi.fn() };
});

vi.mock("libheif-js/libheif-wasm/libheif.js", () => {
  return { default: libheif.createModule };
});
vi.mock("libheif-js/libheif-wasm/libheif.wasm?url", () => {
  return { default: "/assets/libheif.wasm" };
});

/** What the tests hold of the options libheif's factory was handed. */
type RuntimeOptions = {
  onRuntimeInitialized: () => void;
  onAbort: (reason: unknown) => void;
  HeifDecoder?: unknown;
  heif_context_free?: (context: number) => void;
};

/** The calls made against the stub runtime, and the pieces under test. */
type StubRuntime = {
  image: {
    get_width: () => number;
    get_height: () => number;
    is_primary: () => boolean;
    display: ReturnType<typeof vi.fn>;
    free: ReturnType<typeof vi.fn>;
  };
  freeContext: ReturnType<typeof vi.fn>;
  /** The options object of the most recent start. */
  options: () => RuntimeOptions;
};

/**
 * Makes libheif's factory start a runtime whose one image is shown by
 * `display`, the way the real glue decorates the options it is handed.
 */
function _stubLibheif(
  display: (
    target: ImageData,
    done: (decoded: ImageData | null) => void,
  ) => void,
): StubRuntime {
  let latest: RuntimeOptions | undefined;
  const image = {
    get_width: () => {
      return 40;
    },
    get_height: () => {
      return 30;
    },
    is_primary: () => {
      return true;
    },
    display: vi.fn(display),
    free: vi.fn(),
  };
  const freeContext = vi.fn();
  libheif.createModule.mockImplementation((options: RuntimeOptions) => {
    latest = options;
    options.HeifDecoder = class {
      decoder: number | null = 7;
      decode(): unknown[] {
        return [image];
      }
    };
    options.heif_context_free = freeContext;
    queueMicrotask(() => {
      options.onRuntimeInitialized();
    });
  });
  return {
    image,
    freeContext,
    options: () => {
      if (latest === undefined) {
        throw new Error("libheif was never started");
      }
      return latest;
    },
  };
}

/** A HEIC file whose bytes read at once, with no timer in the way. */
function _makeHeicFile(): Blob {
  const file = new Blob(["heic"], { type: "image/heic" });
  vi.spyOn(file, "arrayBuffer").mockResolvedValue(new ArrayBuffer(4));
  return file;
}

/** The module under test, fresh: it caches its runtime between calls. */
async function _freshModule(): Promise<
  typeof import("@/upload/makeImageDataFromHeic/makeImageDataFromHeic")
> {
  vi.resetModules();
  return import("@/upload/makeImageDataFromHeic/makeImageDataFromHeic");
}

beforeEach(() => {
  libheif.createModule.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => {
          return new ArrayBuffer(8);
        },
      };
    }),
  );
  vi.stubGlobal(
    "ImageData",
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("makeImageDataFromHeic", () => {
  it("decodes the primary image and releases every native handle", async () => {
    const stub = _stubLibheif((target, done) => {
      done(target);
    });
    const { makeImageDataFromHeic } = await _freshModule();

    await expect(makeImageDataFromHeic(_makeHeicFile())).resolves.toMatchObject(
      { width: 40, height: 30 },
    );
    expect(stub.image.free).toHaveBeenCalledTimes(1);
    expect(stub.freeContext).toHaveBeenCalledWith(7);
  });

  it("rejects when libheif answers that it could not decode", async () => {
    const stub = _stubLibheif((_target, done) => {
      done(null);
    });
    const { makeImageDataFromHeic } = await _freshModule();

    await expect(makeImageDataFromHeic(_makeHeicFile())).rejects.toThrow(
      "could not decode",
    );
    expect(stub.image.free).toHaveBeenCalledTimes(1);
  });

  it("rejects, rather than wait for ever, on a decode that never answers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // libheif decodes inside a timer of its own: if that throws, the
    // callback is simply never called.
    const stub = _stubLibheif(() => {});
    const { HEIC_DECODE_TIMEOUT_MS, makeImageDataFromHeic } =
      await _freshModule();

    const decoding = makeImageDataFromHeic(_makeHeicFile());
    const outcome = expect(decoding).rejects.toThrow("did not finish");
    await vi.advanceTimersByTimeAsync(HEIC_DECODE_TIMEOUT_MS);

    await outcome;
    // The decode may still be running inside the abandoned runtime, so its
    // handles are left alone rather than freed under it.
    expect(stub.image.free).not.toHaveBeenCalled();
  });

  it("starts a fresh runtime after one decode timed out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    _stubLibheif(() => {});
    const { HEIC_DECODE_TIMEOUT_MS, makeImageDataFromHeic } =
      await _freshModule();
    const firstDecode = makeImageDataFromHeic(_makeHeicFile());
    const firstOutcome = expect(firstDecode).rejects.toThrow("did not finish");
    await vi.advanceTimersByTimeAsync(HEIC_DECODE_TIMEOUT_MS);
    await firstOutcome;

    _stubLibheif((target, done) => {
      done(target);
    });
    await expect(makeImageDataFromHeic(_makeHeicFile())).resolves.toMatchObject(
      { width: 40, height: 30 },
    );

    expect(libheif.createModule).toHaveBeenCalledTimes(2);
  });

  it("fails a decode at once when the runtime aborts under it", async () => {
    const stub = _stubLibheif(() => {
      stub.options().onAbort("memory access out of bounds");
    });
    const { makeImageDataFromHeic } = await _freshModule();

    await expect(makeImageDataFromHeic(_makeHeicFile())).rejects.toThrow(
      "libheif aborted: memory access out of bounds",
    );
    expect(stub.image.free).not.toHaveBeenCalled();
  });

  it("starts a fresh runtime after one aborted mid-decode", async () => {
    const aborting = _stubLibheif(() => {
      aborting.options().onAbort("trap");
    });
    const { makeImageDataFromHeic } = await _freshModule();
    await expect(makeImageDataFromHeic(_makeHeicFile())).rejects.toThrow(
      "aborted",
    );

    _stubLibheif((target, done) => {
      done(target);
    });
    await expect(makeImageDataFromHeic(_makeHeicFile())).resolves.toMatchObject(
      { width: 40, height: 30 },
    );

    expect(libheif.createModule).toHaveBeenCalledTimes(2);
  });

  it("forgets a runtime that never started, so the next HEIC tries again", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValue({
          ok: true,
          status: 200,
          arrayBuffer: async () => {
            return new ArrayBuffer(8);
          },
        }),
    );
    _stubLibheif((target, done) => {
      done(target);
    });
    const { makeImageDataFromHeic } = await _freshModule();

    await expect(makeImageDataFromHeic(_makeHeicFile())).rejects.toThrow("404");
    await expect(makeImageDataFromHeic(_makeHeicFile())).resolves.toMatchObject(
      { width: 40, height: 30 },
    );
  });

  it("starts libheif once, however many HEICs follow", async () => {
    _stubLibheif((target, done) => {
      done(target);
    });
    const { makeImageDataFromHeic } = await _freshModule();

    await makeImageDataFromHeic(_makeHeicFile());
    await makeImageDataFromHeic(_makeHeicFile());

    expect(libheif.createModule).toHaveBeenCalledTimes(1);
  });
});
