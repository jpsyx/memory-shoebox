import createLibheifModule from "libheif-js/libheif-wasm/libheif.js";
import libheifWasmUrl from "libheif-js/libheif-wasm/libheif.wasm?url";

/*
 * libheif, compiled to WebAssembly: the HEIC decoder for a browser that has
 * none (decision 1). This module is only ever reached through a dynamic
 * `import()` in `makeImageDerivatives`, so its 90 KB of glue is its own chunk
 * and the 1.4 MB `.wasm` is an asset fetched on first use: a Safari uploader,
 * whose browser decodes HEIC natively, downloads neither.
 *
 * The package's own declaration types the Emscripten runtime and not the
 * `HeifDecoder` its glue adds, so the part used here is typed below.
 */

/**
 * How long one image's decode may take before it is given up on.
 *
 * libheif's `display` runs its decode inside a timer of its own and reports
 * through a callback, so a decode that throws there (a WebAssembly trap, a
 * `RangeError`) never calls back, and without this limit the promise below
 * would never settle and would hold its lane and the batch for ever. Thirty
 * seconds is several times what a 24 MP photograph takes on a slow phone.
 */
export const HEIC_DECODE_TIMEOUT_MS = 30_000;

/** One image inside a HEIF file. */
type LibheifImage = {
  get_width: () => number;
  get_height: () => number;
  is_primary: () => boolean;
  display: (
    target: ImageData,
    onDecoded: (decoded: ImageData | null) => void,
  ) => void;
  free: () => void;
};

/** A parsed HEIF file. `decoder` is the native context, freed by hand. */
type LibheifDecoder = {
  decoder: number | null;
  decode: (bytes: Uint8Array) => LibheifImage[];
};

/**
 * The options object handed to the Emscripten factory.
 *
 * The factory decorates and returns this same object, so once
 * `onRuntimeInitialized` has run it also carries `HeifDecoder` and the
 * exported C functions. `failDecodesInFlight` and `abandon` are this
 * module's own additions, which the factory ignores.
 */
type LibheifRuntime = {
  wasmBinary: ArrayBuffer;
  onRuntimeInitialized: () => void;
  onAbort: (reason: unknown) => void;
  /** Rejects every decode waiting on this runtime. */
  failDecodesInFlight: Set<(error: Error) => void>;
  /** True once this runtime is forgotten: its handles are left alone. */
  isAbandoned: boolean;
  /** Forgets this runtime, so the next HEIC starts a fresh one. */
  abandon: () => void;
  HeifDecoder?: new () => LibheifDecoder;
  heif_context_free?: (context: number) => void;
};

let runtimePromise: Promise<LibheifRuntime> | undefined;

/** Forgets `loading` if it is still the cached runtime. */
function _forgetRuntime(loading: Promise<LibheifRuntime>): void {
  if (runtimePromise === loading) {
    runtimePromise = undefined;
  }
}

/**
 * Fetches the `.wasm` and starts libheif, settled once its runtime is ready.
 *
 * The `.wasm` is fetched and handed over as `wasmBinary` rather than located
 * by the glue, so the URL is the hashed asset Vite emitted and the glue's own
 * synchronous fallback never runs. An abort, at startup or later under a
 * decode, rejects what was waiting on this runtime and abandons it.
 */
async function _startLibheif(
  forgetThisRuntime: () => void,
): Promise<LibheifRuntime> {
  const response = await fetch(libheifWasmUrl);
  if (!response.ok) {
    throw new Error(`libheif.wasm was not fetched: ${response.status}`);
  }
  const wasmBinary = await response.arrayBuffer();
  return new Promise<LibheifRuntime>((settle, fail) => {
    const runtime: LibheifRuntime = {
      wasmBinary,
      failDecodesInFlight: new Set(),
      isAbandoned: false,
      abandon: () => {
        runtime.isAbandoned = true;
        forgetThisRuntime();
      },
      onRuntimeInitialized: () => {
        settle(runtime);
      },
      onAbort: (reason) => {
        const error = new Error(`libheif aborted: ${String(reason)}`);
        fail(error);
        runtime.failDecodesInFlight.forEach((failDecode) => {
          failDecode(error);
        });
        runtime.abandon();
      },
    };
    createLibheifModule(runtime);
  });
}

/**
 * The libheif runtime, started once per worker.
 *
 * A start that fails, and a runtime that aborts or is abandoned after a
 * decode timed out, are forgotten, so the next HEIC starts afresh rather
 * than inheriting a runtime that cannot decode.
 */
function _loadLibheif(): Promise<LibheifRuntime> {
  if (runtimePromise === undefined) {
    const loading: Promise<LibheifRuntime> = _startLibheif(() => {
      _forgetRuntime(loading);
    }).catch((error: unknown) => {
      _forgetRuntime(loading);
      throw error;
    });
    runtimePromise = loading;
  }
  return runtimePromise;
}

/**
 * The primary image's pixels, decoded with libheif's own transforms.
 *
 * **Always settles**: with the pixels, with libheif's own refusal, with the
 * runtime's abort the moment it happens, or, for a decode that goes quiet,
 * after `HEIC_DECODE_TIMEOUT_MS`, which abandons the runtime because the
 * decode may still be running inside it.
 */
function _displayPrimary(
  runtime: LibheifRuntime,
  image: LibheifImage,
): Promise<ImageData> {
  return new Promise<ImageData>((settle, fail) => {
    const timer = setTimeout(() => {
      runtime.failDecodesInFlight.delete(fail);
      runtime.abandon();
      fail(
        new Error(
          `libheif did not finish within ${HEIC_DECODE_TIMEOUT_MS / 1000} s`,
        ),
      );
    }, HEIC_DECODE_TIMEOUT_MS);
    const onSettled = (): void => {
      clearTimeout(timer);
      runtime.failDecodesInFlight.delete(fail);
    };
    runtime.failDecodesInFlight.add(fail);
    try {
      const target = new ImageData(image.get_width(), image.get_height());
      image.display(target, (decoded) => {
        onSettled();
        if (decoded === null) {
          fail(new Error("libheif could not decode the image"));
        } else {
          settle(decoded);
        }
      });
    } catch (error: unknown) {
      onSettled();
      fail(error);
    }
  });
}

/** Releases the native handles of one decode, unless its runtime is gone. */
function _freeNativeHandles(options: {
  runtime: LibheifRuntime;
  decoder: LibheifDecoder;
  images: readonly LibheifImage[];
}): void {
  const { runtime, decoder, images } = options;
  if (runtime.isAbandoned) {
    return;
  }
  images.forEach((image) => {
    image.free();
  });
  if (decoder.decoder !== null) {
    runtime.heif_context_free?.(decoder.decoder);
    decoder.decoder = null;
  }
}

/**
 * Decodes a HEIC or HEIF file's primary image to upright RGBA pixels.
 *
 * libheif applies the file's own rotation and mirror boxes, so the result is
 * the picture as it is meant to be seen and its size is the displayed one;
 * EXIF orientation is not applied on top, because for HEIF it describes the
 * same turn. Every native handle is released before this returns, but the
 * WebAssembly heap never shrinks, which is why the engine recycles a worker
 * after `appConfig.upload.heicWorkerRecycleCount` of these.
 *
 * **Always settles.** A decode that throws inside libheif, or never answers,
 * rejects (see `HEIC_DECODE_TIMEOUT_MS`), and the runtime that failed it is
 * forgotten, its handles left unfreed because they may still be in use, so
 * the next call starts a fresh one.
 *
 * @param file The picked HEIC or HEIF file.
 * @returns Full-resolution pixels: 96 MB for a 24 MP photograph.
 */
export async function makeImageDataFromHeic(file: Blob): Promise<ImageData> {
  const runtime = await _loadLibheif();
  if (runtime.HeifDecoder === undefined) {
    runtime.abandon();
    throw new Error("libheif started without a HeifDecoder");
  }
  const decoder = new runtime.HeifDecoder();
  const images = decoder.decode(new Uint8Array(await file.arrayBuffer()));
  try {
    const primary =
      images.find((image) => {
        return image.is_primary();
      }) ?? images[0];
    if (primary === undefined) {
      throw new Error("libheif found no image in the file");
    }
    return await _displayPrimary(runtime, primary);
  } finally {
    _freeNativeHandles({ runtime, decoder, images });
  }
}
