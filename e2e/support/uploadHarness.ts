import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import {
  uploadSessionDetailSchema,
  type CompleteUploadFileResponse,
  type ManifestOutcome,
  type UploadProblemCode,
  type UploadSessionState,
} from "@memory-shoebox/shared";
import { appConfig } from "../../app.config.ts";

/**
 * Everything the upload spec and its setup project share that is not a read
 * of the catalog: who uploads, where the fixtures are, the harness page and
 * how to read what it recorded, and the multipart file.
 */

/**
 * The member who uploads. An uploader rather than an admin, because that is
 * the role this step is for, and an admin would pass role checks an uploader
 * must pass on their own.
 */
export const UPLOADER_EMAIL = "tio@example.com";

/**
 * A viewer who has accepted their invitation, so the batch has somebody to
 * tell who is not the uploader and not an admin.
 */
export const FAMILY_EMAIL = "abuelo@example.com";

/**
 * Where the setup project leaves the uploader's session for both browsers.
 *
 * Under `test-results/`, which Playwright empties at the start of every run
 * and which is gitignored, so a session from yesterday's catalog can never be
 * read by today's run.
 */
export const UPLOADER_STATE_PATH = fileURLToPath(
  new URL("../../test-results/upload-uploader-state.json", import.meta.url),
);

/** The committed fixtures, which `makeUploadFixtures.ts` writes. */
export const UPLOAD_FIXTURE_DIRECTORY = fileURLToPath(
  new URL("../fixtures/upload/", import.meta.url),
);

/** The five committed media fixtures, in the order a spec picks them. */
export const MEDIA_FIXTURE_NAMES = [
  "portrait-orientation-6.jpg",
  "heic-rotated.heic",
  "IMG-20260503-WA0001.jpg",
  "h264-clip.mp4",
  "hevc-clip.mov",
] as const;

/** The file the manifest refuses. */
export const REFUSED_FIXTURE_NAME = "not-media.pdf";

/** The file written at run time, large enough to go multipart. */
export const MULTIPART_FIXTURE_NAME = "multipart-clip.mp4";

/**
 * A second copy of the rotated JPEG under another name, written at run time.
 * The manifest matches a hashless pick by name and size, so it takes this for
 * a new photograph; only presign, which has the hash, can tell.
 */
export const DUPLICATE_FIXTURE_NAME = "portrait-orientation-6-copy.jpg";

/**
 * The dev-only harness. The end-to-end build includes it and no other build
 * does (`apps/web/vite.config.ts`).
 */
export const UPLOAD_PROOF_PATH = "/upload-proof.html";

/**
 * The engine's events, as
 * `apps/web/src/upload/createUploadEngine/createUploadEngine.ts` defines them.
 * Restated rather than imported: importing `apps/web` source here would pull
 * that package's module graph, aliases and Vite types into the root
 * type-check.
 */
export type UploadProofEvent =
  | { kind: "file-started"; fileId: string }
  | {
      kind: "file-progress";
      fileId: string;
      sentBytes: number;
      totalBytes: number;
    }
  | { kind: "file-done"; fileId: string; response: CompleteUploadFileResponse }
  | {
      kind: "file-failed";
      fileId: string;
      problemCode: UploadProblemCode;
      detail: string;
    }
  | { kind: "file-skipped"; fileId: string; reason: "duplicate" }
  | { kind: "settled"; sessionState: UploadSessionState }
  | { kind: "batch-closed" };

/** Where the harness is in one run. */
export type UploadProofPhase =
  | "idle"
  | "declaring"
  | "held"
  | "transferring"
  | "finished"
  | "failed";

/** `window.__uploadProof`, the harness's record of one run, as a spec reads it. */
export type UploadProofState = {
  phase: UploadProofPhase;
  sessionId: string | null;
  isResume: boolean;
  outcomes: ManifestOutcome[];
  events: UploadProofEvent[];
  error: string | null;
};

/** The harness's state, copied out of the page as plain JSON. */
export async function readUploadProofState(
  page: Page,
): Promise<UploadProofState> {
  const state: unknown = await page.evaluate(() => {
    const proof = (window as unknown as { __uploadProof?: unknown })
      .__uploadProof;
    // A copy without the `release` function, which does not serialise.
    return proof === undefined ? null : JSON.parse(JSON.stringify(proof));
  });
  if (state === null) {
    throw new Error(
      "upload-proof.html set no window.__uploadProof. Is this the end-to-end " +
        "build, with WEB_BUILD_UPLOAD_PROOF set?",
    );
  }
  return state as UploadProofState;
}

/**
 * Waits for the harness to reach a phase, and fails at once on `failed`.
 *
 * @param options.page A page showing the harness.
 * @param options.phase The phase to wait for.
 * @returns The state at that moment.
 */
export async function waitForUploadProofPhase(options: {
  page: Page;
  phase: UploadProofPhase;
}): Promise<UploadProofState> {
  await options.page.waitForFunction(
    (wanted) => {
      const phase = (window as unknown as { __uploadProof?: { phase: string } })
        .__uploadProof?.phase;
      return phase === wanted || phase === "failed";
    },
    options.phase,
    { timeout: 150_000 },
  );
  const state = await readUploadProofState(options.page);
  if (state.phase === "failed") {
    throw new Error(`The harness failed: ${state.error ?? "no message"}`);
  }
  return state;
}

/**
 * The events of one kind, narrowed, so a spec reads `response` without a cast.
 *
 * @param options.state The harness's state.
 * @param options.kind The event kind to keep.
 * @returns Those events, in order.
 */
export function getEventsFromState<
  Kind extends UploadProofEvent["kind"],
>(options: {
  state: Readonly<UploadProofState>;
  kind: Kind;
}): Array<Extract<UploadProofEvent, { kind: Kind }>> {
  return options.state.events.filter(
    (event): event is Extract<UploadProofEvent, { kind: Kind }> => {
      return event.kind === options.kind;
    },
  );
}

/**
 * The batch a run used, which every run that got past `GET /current` names.
 *
 * @param state The harness's state, read at `held` or `finished`.
 * @returns The session id.
 * @throws If the harness reached that phase without naming a batch.
 */
export function getSessionIdFromState(
  state: Readonly<UploadProofState>,
): string {
  if (state.sessionId === null) {
    throw new Error(
      `The harness reached ${state.phase} without naming a batch`,
    );
  }
  return state.sessionId;
}

/**
 * Writes a playable MP4 half a part past the multipart threshold, so that it
 * goes up in three parts: two whole ones and a half.
 *
 * **Generated at run time, because it cannot be committed**: the threshold is
 * 32 MiB. It is `h264-clip.mp4` with a top-level `free` box appended, which
 * every MP4 reader skips, so it is still a real two-second H.264 video: the
 * browser draws its poster and reads its `creation_time` from `moov`, which
 * `+faststart` put at the front. Random bytes labelled `video/mp4` would have
 * served the transfer just as well and the poster not at all.
 *
 * @param targetPath Where to write it, under the test's own output directory.
 * @returns Its size in bytes.
 */
export function writeMultipartVideo(targetPath: string): number {
  const base = readFileSync(join(UPLOAD_FIXTURE_DIRECTORY, "h264-clip.mp4"));
  const { multipartThresholdBytes, multipartPartSizeBytes } = appConfig.upload;
  const totalBytes = multipartThresholdBytes + multipartPartSizeBytes / 2;
  const freeBoxHeader = Buffer.alloc(8);
  freeBoxHeader.writeUInt32BE(totalBytes - base.length, 0);
  freeBoxHeader.write("free", 4, "latin1");
  const padding = Buffer.alloc(totalBytes - base.length - freeBoxHeader.length);
  writeFileSync(targetPath, Buffer.concat([base, freeBoxHeader, padding]));
  return totalBytes;
}

/** A storage state, as Playwright saves one and `newContext` takes one. */
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * The uploader's saved session, in the form this browser will keep.
 *
 * **WebKit is given the cookie without `Secure`, and that is measured, not
 * guessed.** Playwright's WebKit neither stores nor sends a `Secure` cookie
 * over `http://localhost`, where Chromium and Chrome both do, so the cookie
 * the setup project captured in Chromium would be dropped on the way in. The
 * server reads the cookie's value and nothing else, so the attribute changes
 * nothing it checks, and production is HTTPS.
 *
 * @param browserName The project's browser.
 * @returns A storage state for `browser.newContext`.
 */
export function getUploaderStorageState(browserName: string): StorageState {
  if (!existsSync(UPLOADER_STATE_PATH)) {
    throw new Error(
      `${UPLOADER_STATE_PATH} is missing. The upload-setup project writes it, ` +
        "and it runs first unless --no-deps was passed.",
    );
  }
  const state = JSON.parse(
    readFileSync(UPLOADER_STATE_PATH, "utf8"),
  ) as StorageState;
  if (browserName !== "webkit") {
    return state;
  }
  return {
    ...state,
    cookies: state.cookies.map((cookie) => {
      return { ...cookie, secure: false };
    }),
  };
}

/**
 * Closes whatever batch the uploader left open, so each test starts with none.
 *
 * One member uploads in both browsers and in both tests, and `POST
 * /api/upload-sessions` refuses a second open batch. A test that failed
 * half-way would otherwise hand its batch to the next one as a resume. A
 * draft is cancelled; a batch already uploading is committed with `intent:
 * "close"`, which closes it with what arrived, because a committed batch
 * cannot be cancelled (design decision 17).
 *
 * @param request The uploader's context's request client.
 */
export async function closeOpenUploadSession(
  request: APIRequestContext,
): Promise<void> {
  const current = await request.get("/api/upload-sessions/current");
  if (current.status() === 204) {
    return;
  }
  const detail = uploadSessionDetailSchema.parse(await current.json());
  const response =
    detail.state === "draft"
      ? await request.delete(`/api/upload-sessions/${detail.sessionId}`)
      : await request.post(`/api/upload-sessions/${detail.sessionId}/commit`, {
          data: { intent: "close" },
        });
  if (!response.ok()) {
    throw new Error(
      `Could not close the uploader's open batch: ${response.status()}`,
    );
  }
}

/**
 * Whether Google Chrome is where Playwright's `chrome` channel looks for it.
 *
 * The paths are Playwright's own, from its registry, so a `true` here is a
 * launch that will find the browser.
 */
export function isGoogleChromeInstalled(): boolean {
  const pathByPlatform: Partial<Record<NodeJS.Platform, string[]>> = {
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
    linux: ["/opt/google/chrome/chrome"],
    win32: [process.env.LOCALAPPDATA, process.env.PROGRAMFILES]
      .filter((root): root is string => {
        return root !== undefined;
      })
      .map((root) => {
        return join(root, "Google", "Chrome", "Application", "chrome.exe");
      }),
  };
  return (pathByPlatform[process.platform] ?? []).some((path) => {
    return existsSync(path);
  });
}
