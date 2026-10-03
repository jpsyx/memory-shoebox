import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createXhrUploadTransport,
  STALLED_PUT_TIMEOUT_MS,
  UploadNetworkError,
  type PutBytesOptions,
} from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

/**
 * The slice of `XMLHttpRequest` the transport uses, with its events fired by
 * hand. A class because the transport calls it with `new`.
 */
class FakeXhr extends EventTarget {
  static requests: FakeXhr[] = [];

  readonly upload = new EventTarget();
  readonly requestHeaders: Record<string, string> = {};
  readonly responseHeaders: Record<string, string> = {};
  method = "";
  url = "";
  body: unknown = undefined;
  status = 0;
  abortCount = 0;

  constructor() {
    super();
    FakeXhr.requests.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name] = value;
  }

  send(body: unknown): void {
    this.body = body;
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name] ?? null;
  }

  abort(): void {
    this.abortCount += 1;
    this.dispatchEvent(new Event("abort"));
    this.dispatchEvent(new Event("loadend"));
  }

  /** The server answered: `load`, then `loadend`, as a browser fires them. */
  respond(
    functionOptions: Readonly<{
      status: number;
      headers?: Record<string, string>;
    }>,
  ): void {
    const { status, headers = {} } = functionOptions;

    this.status = status;
    Object.assign(this.responseHeaders, headers);
    this.dispatchEvent(new Event("load"));
    this.dispatchEvent(new Event("loadend"));
  }

  /** No answer came: `error`, then `loadend`. */
  failToConnect(): void {
    this.dispatchEvent(new Event("error"));
    this.dispatchEvent(new Event("loadend"));
  }
}

/** The only request a test made. */
function _onlyRequest(): FakeXhr {
  expect(FakeXhr.requests).toHaveLength(1);
  const [request] = FakeXhr.requests;
  if (request === undefined) {
    throw new Error("No request was made");
  }
  return request;
}

/** Options for one PUT, with whatever the test overrides. */
function _options(
  overrides: Partial<
    Omit<PutBytesOptions, "headers"> & {
      headers: Readonly<Record<string, string>>;
    }
  > = {},
): PutBytesOptions {
  return {
    url: "https://b2/part-1",
    headers: { "Content-Type": "video/quicktime" },
    body: new Blob([new Uint8Array(4)]),
    onProgress: () => {},
    signal: new AbortController().signal,
    ...overrides,
  };
}

afterEach(() => {
  FakeXhr.requests = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createXhrUploadTransport", () => {
  it("PUTs the body with the presigned headers, and reads the ETag", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const options = _options();

    const pending = createXhrUploadTransport().putBytes(options);
    const request = _onlyRequest();
    request.respond({ status: 200, headers: { ETag: '"abc"' } });

    await expect(pending).resolves.toEqual({ status: 200, etag: '"abc"' });
    expect(request.method).toBe("PUT");
    expect(request.url).toBe("https://b2/part-1");
    expect(request.requestHeaders).toEqual({
      "Content-Type": "video/quicktime",
    });
    expect(request.body).toBe(options.body);
  });

  it("answers a null ETag when the bucket's CORS rule hides it", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);

    const pending = createXhrUploadTransport().putBytes(_options());
    _onlyRequest().respond({ status: 200 });

    await expect(pending).resolves.toEqual({ status: 200, etag: undefined });
  });

  it("resolves for an error status too, rejecting only for no answer", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);

    const refused = createXhrUploadTransport().putBytes(_options());
    _onlyRequest().respond({ status: 403 });
    await expect(refused).resolves.toEqual({ status: 403, etag: undefined });

    const lost = createXhrUploadTransport().putBytes(_options());
    FakeXhr.requests[1]?.failToConnect();
    await expect(lost).rejects.toBeInstanceOf(UploadNetworkError);
  });

  it("reports the bytes the browser says it has sent", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const onProgress = vi.fn();

    const pending = createXhrUploadTransport().putBytes(
      _options({ onProgress }),
    );
    const request = _onlyRequest();
    request.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 3 }));
    request.respond({ status: 200 });
    await pending;

    expect(onProgress).toHaveBeenCalledWith(3);
  });

  it("aborts the request when the signal aborts, and rejects as cancelled", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const controller = new AbortController();

    const pending = createXhrUploadTransport().putBytes(
      _options({ signal: controller.signal }),
    );
    const request = _onlyRequest();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(request.abortCount).toBe(1);
  });

  it("makes no request at all for a signal that is already aborted", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const controller = new AbortController();
    controller.abort();

    const pending = createXhrUploadTransport().putBytes(
      _options({ signal: controller.signal }),
    );

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.requests).toHaveLength(0);
  });

  it.each([
    [
      "answered",
      (request: FakeXhr) => {
        request.respond({ status: 200 });
      },
    ],
    [
      "got no answer",
      (request: FakeXhr) => {
        request.failToConnect();
      },
    ],
  ])("lets go of the signal once the request %s", async (_name, finish) => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const controller = new AbortController();

    const pending = createXhrUploadTransport().putBytes(
      _options({ signal: controller.signal }),
    );
    const request = _onlyRequest();
    finish(request);
    await pending.catch(() => {});
    // One signal spans a whole batch: a listener left on it would keep this
    // request, its body and its closures alive until the batch ends.
    controller.abort();

    expect(request.abortCount).toBe(0);
  });
});

describe("createXhrUploadTransport on a stalled link", () => {
  // Reports `loaded` bytes sent, as the browser's upload progress does.
  const _progress = (
    options: Readonly<{ request: FakeXhr; loaded: number }>,
  ): void => {
    const { request, loaded } = options;
    request.upload.dispatchEvent(new ProgressEvent("progress", { loaded }));
  };

  it("aborts a PUT that makes no progress for the interval, as a network error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("XMLHttpRequest", FakeXhr);

    const pending = createXhrUploadTransport().putBytes(_options());
    const outcome = pending.catch((error: unknown) => {
      return error;
    });
    const request = _onlyRequest();
    vi.advanceTimersByTime(STALLED_PUT_TIMEOUT_MS - 1);
    expect(request.abortCount).toBe(0);
    vi.advanceTimersByTime(1);

    expect(request.abortCount).toBe(1);
    // A network error, not a cancellation: the transfer retries it.
    const error = await outcome;
    expect(error).toBeInstanceOf(UploadNetworkError);
    expect(String(error)).toContain("no progress");
  });

  it("counts every progress event as life, and starts the interval again", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("XMLHttpRequest", FakeXhr);

    const pending = createXhrUploadTransport().putBytes(_options());
    const request = _onlyRequest();
    vi.advanceTimersByTime(STALLED_PUT_TIMEOUT_MS - 1000);
    _progress({ request: request, loaded: 1 });
    vi.advanceTimersByTime(STALLED_PUT_TIMEOUT_MS - 1000);
    _progress({ request: request, loaded: 2 });
    vi.advanceTimersByTime(STALLED_PUT_TIMEOUT_MS - 1000);
    request.respond({ status: 200 });

    await expect(pending).resolves.toEqual({ status: 200, etag: undefined });
    expect(request.abortCount).toBe(0);
  });

  it("leaves no timer behind once the request has an answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("XMLHttpRequest", FakeXhr);

    const pending = createXhrUploadTransport().putBytes(_options());
    const request = _onlyRequest();
    request.respond({ status: 200 });
    await pending;

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(STALLED_PUT_TIMEOUT_MS * 2);
    expect(request.abortCount).toBe(0);
  });

  it("still reports a cancellation as a cancellation", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const controller = new AbortController();

    const pending = createXhrUploadTransport().putBytes(
      _options({ signal: controller.signal }),
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
