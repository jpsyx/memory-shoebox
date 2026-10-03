import type { UploadedFileRecord } from "../uploadCatalogHelpers.ts";
import { expect } from "@playwright/test";

import { appConfig } from "../../../app.config.ts";

import type { FakeS3Request } from "../createFakeS3Server/createFakeS3Server.types.ts";

import {
  getOriginalRequestsFromLog,
  readEligibleRecipientAddresses,
  readUploadSession,
  readUploadSessionEmailAddresses,
} from "../uploadCatalogHelpers.ts";

import {
  FAMILY_EMAIL,
  getEventsFromState,
  MULTIPART_FIXTURE_NAME,
  UPLOADER_EMAIL,
  type UploadProofState,
} from "../uploadHarnessHelpers.ts";

import type { ExpectTheTransferPathsOptions } from "./uploadExpectations.types.ts";

import { getFileFromFilesByName } from "./uploadCatalogExpectationHelpers.ts";

/**
 * The large file went up in parts and was completed; a small one went up
 * whole and never opened a multipart upload.
 *
 * Read from the stand-in's statuses, not only its operations: a part counts
 * once the stand-in stored it, and the multipart upload is complete only if
 * a `CompleteMultipartUpload` was answered `200`.
 *
 * @param options.sessionId The batch.
 * @param options.files The batch's records.
 * @param options.requests The stand-in's log.
 * @param options.multipartBytes The large file's size.
 */
export function expectTheTransferPaths(
  options: Readonly<Omit<ExpectTheTransferPathsOptions, "files" | "requests">> &
    Readonly<{
      files: readonly UploadedFileRecord[];
      requests: readonly FakeS3Request[];
    }>,
): void {
  const { sessionId, files, requests } = options;
  const big = getOriginalRequestsFromLog({
    log: requests,
    sessionId,
    fileId: getFileFromFilesByName({
      files: files,
      name: MULTIPART_FIXTURE_NAME,
    }).fileId,
  });
  const partCount = Math.ceil(
    options.multipartBytes / appConfig.upload.multipartPartSizeBytes,
  );
  const storedParts = big.filter((request) => {
    return request.operation === "UploadPart" && request.status === 200;
  });
  expect(big[0]).toMatchObject({
    operation: "CreateMultipartUpload",
    status: 200,
  });
  expect(storedParts).toHaveLength(partCount);
  expect(big).toContainEqual(
    expect.objectContaining({
      operation: "CompleteMultipartUpload",
      status: 200,
    }),
  );
  expect(big.map(_getOperationFromRequest)).not.toContain("PutObject");
  const small = getOriginalRequestsFromLog({
    log: requests,
    sessionId,
    fileId: getFileFromFilesByName({
      files: files,
      name: "portrait-orientation-6.jpg",
    }).fileId,
  });
  expect(small[0]).toMatchObject({ operation: "PutObject", status: 200 });
  expect(small.map(_getOperationFromRequest)).not.toContain(
    "CreateMultipartUpload",
  );
}

/** One log entry's operation name. */
function _getOperationFromRequest(request: Readonly<FakeS3Request>): string {
  return request.operation;
}

/**
 * Exactly one completion settled the batch, the engine said so once, and the
 * session row agrees.
 *
 * @param options.sessionId The batch.
 * @param options.proof The harness's record of the run that finished it.
 */
export async function expectSettledOnce(
  options: Readonly<{
    sessionId: string;
    proof: Readonly<UploadProofState>;
  }>,
): Promise<void> {
  const completions = getEventsFromState({
    state: options.proof,
    kind: "file-done",
  });
  const settling = completions.filter((event) => {
    return event.response.didSettle;
  });
  expect(settling).toHaveLength(1);
  expect(getEventsFromState({ state: options.proof, kind: "settled" })).toEqual(
    [{ kind: "settled", sessionState: "settled" }],
  );
  expect(await readUploadSession(options.sessionId)).toMatchObject({
    state: "settled",
  });
}

/**
 * One `upload_session` message to every member who should hear, and to
 * nobody else.
 *
 * Nobody can be written to twice: the unique index on
 * `outbound_emails.idempotency_key` and the latch both forbid it. That the
 * batch settled once is `expectSettledOnce`'s claim, proven by the single
 * `didSettle` and the single `settled` event, not by this.
 *
 * @param sessionId The batch.
 */
export async function expectOneEmailPerRecipient(
  sessionId: string,
): Promise<void> {
  const addresses = await readUploadSessionEmailAddresses(sessionId);
  // Equal to the sorted eligible set: everybody who should hear, and only
  // them.
  expect(addresses).toEqual(
    await readEligibleRecipientAddresses(UPLOADER_EMAIL),
  );
  expect(addresses).toContain(FAMILY_EMAIL);
  expect(addresses).not.toContain(UPLOADER_EMAIL);
  const session = await readUploadSession(sessionId);
  expect(session.notifiedMemberCount).toBe(addresses.length);
}
