import { act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  detail,
  renderAttachmentController,
  second,
} from "./attachmentTestHelpers";
function _installUncertainAttachmentRecovery(failure: string): {
  attempts: number;
  urls: string[];
} {
  const responseState: Pick<{ attempts: number; urls: string[] }, "attempts"> =
    { attempts: 0 };

  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      const query = new URL(url, "http://localhost").searchParams;
      let answer: unknown = detail;
      if (url.includes("candidates")) {
        answer = {
          candidates:
            query.get("scope") === "all" && !query.has("cursor")
              ? []
              : [
                  {
                    item: second,
                    isAttached: query.get("scope") === "all",
                    isOutsideSpan: false,
                  },
                ],
          nextCursor:
            query.get("scope") === "all" && !query.has("cursor")
              ? "recovery"
              : null,
        };
      }
      if (init?.method === "PATCH") {
        responseState.attempts++;
        if (failure === "transport") {
          throw new TypeError("Fixture connection lost");
        }
        answer = { invalid: true };
      }
      return new Response(JSON.stringify(answer), { status: 200 });
    }),
  );
  return Object.assign(responseState, { urls });
}

function _installBlocksAnUncertainRetryWhenTheRecoveryFetch1(): {
  attempts: number;
} {
  const responseState: { attempts: number } = { attempts: 0 };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const candidateBody = url.includes("candidates")
        ? url.includes("scope=all")
          ? { candidates: [], nextCursor: "repeated" }
          : {
              candidates: [
                { item: second, isAttached: false, isOutsideSpan: false },
              ],
              nextCursor: null,
            }
        : detail;
      if (init?.method === "PATCH") {
        responseState.attempts++;
      }
      const body = init?.method === "PATCH" ? {} : candidateBody;
      return new Response(JSON.stringify(body));
    }),
  );
  return responseState;
}

it.each(["schema", "transport"] as const)(
  "uncertain %s save refreshes scope=all with empty advancing pages before a deliberate retry",
  async (failure) => {
    const responses0 = _installUncertainAttachmentRecovery(failure);
    const { result } = renderAttachmentController();
    await waitFor(() => {
      return expect(result.current.entries).toHaveLength(1);
    });
    act(() => {
      return result.current.toggle(second.itemId);
    });
    act(() => {
      return result.current.save();
    });
    await waitFor(() => {
      return expect(result.current.error).toBeDefined();
    });
    expect(result.current.attachCount).toBe(1);
    act(() => {
      return result.current.save();
    });
    await waitFor(() => {
      return expect(result.current.savedDetail).toBeDefined();
    });
    expect(responses0.attempts).toBe(1);
    expect(
      responses0.urls.some((url) => {
        return url.includes("scope=all") && url.includes("cursor=recovery");
      }),
    ).toBe(true);
    expect(result.current.savedCounts).toBeUndefined();
  },
);
it("requires all uncertain IDs, never treating a missing identity as detached", async () => {
  let attempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const candidateBody = url.includes("candidates")
        ? {
            candidates: url.includes("scope=all")
              ? []
              : [{ item: second, isAttached: false, isOutsideSpan: false }],
            nextCursor: null,
          }
        : detail;
      if (init?.method === "PATCH") {
        attempts++;
      }
      const body = init?.method === "PATCH" ? {} : candidateBody;
      return new Response(JSON.stringify(body));
    }),
  );
  const { result } = renderAttachmentController();
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(1);
  });
  act(() => {
    result.current.toggle(second.itemId);
  });
  act(() => {
    result.current.save();
  });
  await waitFor(() => {
    expect(result.current.error).toBeDefined();
  });
  act(() => {
    result.current.save();
  });
  await waitFor(() => {
    expect(result.current.isPending).toBe(false);
  });
  expect(result.current.error).toMatch(/unavailable/);
  expect(attempts).toBe(1);
  expect(result.current.savedDetail).toBeUndefined();
  expect(result.current.attachCount).toBe(1);
});
it("blocks an uncertain retry when the recovery cursor cycles", async () => {
  const responses1 = _installBlocksAnUncertainRetryWhenTheRecoveryFetch1();
  const { result } = renderAttachmentController();
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(1);
  });
  act(() => {
    result.current.toggle(second.itemId);
  });
  act(() => {
    result.current.save();
  });
  await waitFor(() => {
    expect(result.current.error).toBeDefined();
  });
  act(() => {
    result.current.save();
  });
  await waitFor(() => {
    expect(result.current.error).toMatch(/repeated a page/);
  });
  expect(responses1.attempts).toBe(1);
  expect(result.current.attachCount).toBe(1);
  expect(result.current.savedDetail).toBeUndefined();
});
