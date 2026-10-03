import { vi } from "vitest";

/** One canned reply, optionally held open while a case presses something. */
export type Answer = {
  body: unknown;
  status: number;
  waitFor?: Promise<unknown>;
};

/** One request as the server saw it. */
export type RecordedRequest = {
  url: string;
  method: string;
  /** Parsed when it is JSON, as sent when it is not, undefined when none. */
  body: unknown;
};

const recordedRequests: RecordedRequest[] = [];

/** A sent body as JSON, or as the raw string when it is not JSON. */
function _parseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/**
 * Stubs `fetch` with a map of canned answers, and forgets what was asked
 * before. Free of React and the router, so an API module's own suite can use
 * it without loading the app.
 *
 * **Answers are keyed by the path before the `?`**, so a test need not write
 * out the exact parameter order; the full URL is still recorded. A request
 * nothing answers gets a `404`, and a `204` goes out with no body at all.
 *
 * @param answers Answers keyed by `"METHOD /path"`, with no query string.
 */
export function stubFetch(answers: Readonly<Record<string, Answer>>): void {
  recordedRequests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      recordedRequests.push({
        url: String(url),
        method,
        body:
          typeof init?.body === "string" ? _parseBody(init.body) : undefined,
      });
      const pathOnly = String(url).split("?")[0] ?? "";
      const answer = answers[`${method} ${pathOnly}`] ?? {
        body: { error: "not_found", message: "No such route." },
        status: 404,
      };
      await answer.waitFor;
      return new Response(
        answer.status === 204 ? null : JSON.stringify(answer.body),
        {
          status: answer.status,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
}

/** Every request since `stubFetch` was last called, oldest first. */
export function getRecordedRequests(): RecordedRequest[] {
  return [...recordedRequests];
}

/**
 * Every request since `stubFetch` was last called, as `"METHOD /path?query"`.
 */
export function getRecordedLines(): string[] {
  return recordedRequests.map((request) => {
    return `${request.method} ${request.url}`;
  });
}
