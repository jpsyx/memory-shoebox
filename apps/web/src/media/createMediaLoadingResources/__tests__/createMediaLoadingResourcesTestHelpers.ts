import type { MediaPreview, MediaPreviewRequest } from "@memory-shoebox/shared";
import type {
  PrefetchEnvironment,
  PrefetchCandidate,
} from "../../mediaPrefetch.types";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { afterEach, beforeEach, vi } from "vitest";

/** Item whose previews are requested by the media resource tests. */
export const ITEM_ID: string = "10000000-0000-4000-8000-000000000001";

/** A second item used to distinguish simultaneous media requests. */
export const SECOND_ID: string = "10000000-0000-4000-8000-000000000002";

const DETAIL = makeItemDetail({ itemId: ITEM_ID });

/** Preview response built from the shared item detail fixture. */
export const PREVIEW = {
  itemId: ITEM_ID,
  kind: DETAIL.kind,
  width: DETAIL.media.width,
  height: DETAIL.media.height,
  media: DETAIL.media,
} satisfies MediaPreview;

/** Speculative preview request shared by the native and API scenarios. */
export const REQUEST = {
  itemIds: [ITEM_ID],
  purpose: "speculative-preview" as const,
} satisfies MediaPreviewRequest;

/** Visible member environment in which media speculation is allowed. */
export const ENVIRONMENT = {
  memberId: "first",
  selectionKey: "photo",
  visible: true,
  saveData: false,
  effectiveType: "4g" as const,
} satisfies PrefetchEnvironment;

/**
 * Makes a fresh media candidate with bounded size and a one-hour source lease.
 */
export function makePrefetchCandidateFromId(id = "source"): PrefetchCandidate {
  return {
    itemId: id,
    rank: 0,
    kind: "photo",
    decode: true,
    source: {
      ...DETAIL.media.display!,
      renditionId: id,
      byteSize: 8 * 1024 ** 2,
      issuedAt: new Date(0).toISOString(),
      expiresAt: new Date(3600000).toISOString(),
    },
  };
}

/**
 * Holds preview reads until a scenario supplies a response and exposes their
 * signals.
 */
export function stubMediaPreviewReads(): Array<{
  signal: AbortSignal;
  finish: (body: unknown) => void;
}> {
  const requests: Array<{
    signal: AbortSignal;
    finish: (body: unknown) => void;
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_path: string, init: RequestInit) => {
      return new Promise<Response>((resolve) => {
        requests.push({
          signal: init.signal!,
          finish: (body) => {
            return resolve(
              new Response(JSON.stringify(body), {
                headers: { "content-type": "application/json" },
              }),
            );
          },
        });
      });
    }),
  );
  return requests;
}

/**
 * Installs deterministic media timers and restores globals after each scenario.
 */
export function installMediaLoadingTestTimers(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}
