import type { PresignMultipart } from "@memory-shoebox/shared";

import {
  getPartRangesFromSize,
  isLeaseLongEnoughForBytes,
} from "@/upload/transferUploadFile/transferPlanningHelpers";

import type {
  TransferContext,
  MultipartState,
  PartRequest,
  UrlLease,
  SentPart,
} from "./transferUploadFile.types";

import {
  getPresignFromTransferContext,
  getSingleLeaseFromPresign,
  getSingleLeaseFromTransferContext,
} from "./uploadPresignHelpers";

import { UploadTransferError } from "./UploadTransferError";

import { putUploadBytes } from "./putUploadBytes";

/**
 * Fresh URLs for these parts, keeping the upload id (`upload.md`).
 *
 * A re-presign that names a different upload would orphan every part already
 * sent, and `complete` would then assemble nothing from them, so it fails the
 * file here rather than at the end of the transfer.
 */
async function _refreshPartLeases(
  functionOptions: Readonly<{
    context: TransferContext;
    state: MultipartState;
    partNumbers: number[];
  }>,
): Promise<void> {
  const { context, state, partNumbers } = functionOptions;

  const presigned = await getPresignFromTransferContext({
    context: context,
    body: {
      purpose: "original",
      byteSize: context.file.size,
      partNumbers,
    },
  });
  const receivedAtMs = context.now();
  if (presigned.mode !== "multipart") {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: "A part re-presign came back as a single PUT",
    });
  }
  if (presigned.multipartUploadId !== state.presigned.multipartUploadId) {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message:
        "A part re-presign named a different multipart upload, so the parts already sent would be lost",
    });
  }
  presigned.parts.forEach((part) => {
    state.leases.set(part.partNumber, { url: part.url, receivedAtMs });
  });
}

/**
 * The lease for a part, refreshed first if it could not carry the part to
 * its end at the floor rate, however fast the link has been so far: a link
 * that slows mid-part must still finish before the URL lapses.
 */
async function _getLiveLease(
  request: Readonly<PartRequest>,
): Promise<UrlLease> {
  const { context, state, range } = request;
  const lease = state.leases.get(range.partNumber);
  const isLongEnough =
    lease !== undefined &&
    isLeaseLongEnoughForBytes({
      receivedAtMs: lease.receivedAtMs,
      nowMs: context.now(),
      byteCount: range.end - range.start,
    });
  if (!isLongEnough) {
    // Ahead of the expiry's 401 rather than after it, and for every part still
    // to
    // go, so a slow link re-presigns once rather than once a part.
    await _refreshPartLeases({
      context: context,
      state: state,
      partNumbers: [range.partNumber, ...request.laterPartNumbers],
    });
  }
  const fresh = state.leases.get(range.partNumber);
  if (fresh === undefined) {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: `No URL was presigned for part ${range.partNumber}`,
    });
  }
  return fresh;
}

/** Sends one part and answers its ETag. */
async function _sendPart(request: Readonly<PartRequest>): Promise<string> {
  const { context, state, range } = request;
  const lease = await _getLiveLease(request);
  const answer = await putUploadBytes({
    request: {
      context,
      lease,
      headers: state.presigned.headers,
      body: context.file.slice(range.start, range.end),
      represign: async () => {
        await _refreshPartLeases({
          context: context,
          state: state,
          partNumbers: [range.partNumber],
        });
        return state.leases.get(range.partNumber) ?? lease;
      },
    },
  });
  // `complete` refuses a blank ETag as it refuses a missing one.
  if (answer.etag === undefined || answer.etag.trim() === "") {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: `Part ${range.partNumber} landed but its ETag is unreadable: the bucket's CORS rule must expose ETag (pnpm b2:cors)`,
    });
  }
  return answer.etag;
}

/** Every part, in order, each with the ETag `complete` needs. */
async function _sendParts(
  functionOptions: Readonly<{
    context: TransferContext;
    presigned: PresignMultipart;
  }>,
): Promise<SentPart[]> {
  const { context, presigned } = functionOptions;

  const ranges = getPartRangesFromSize({
    byteSize: context.file.size,
    partSizeBytes: presigned.partSizeBytes,
  });
  if (ranges.length !== presigned.partCount) {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: `The server planned ${presigned.partCount} parts and the file makes ${ranges.length}`,
    });
  }
  const receivedAtMs = context.now();
  const state: MultipartState = {
    presigned,
    leases: new Map(
      presigned.parts.map((part) => {
        return [part.partNumber, { url: part.url, receivedAtMs }];
      }),
    ),
  };
  return ranges.reduce<Promise<SentPart[]>>(async (sentSoFar, range, index) => {
    const sent = await sentSoFar;
    const laterPartNumbers = ranges.slice(index + 1).map((later) => {
      return later.partNumber;
    });
    const etag = await _sendPart({ context, state, range, laterPartNumbers });
    return [...sent, { partNumber: range.partNumber, etag }];
  }, Promise.resolve([]));
}

/** The original, by whichever mode the server chose. Answers the ETags. */
export async function sendUploadOriginal(
  context: TransferContext,
): Promise<SentPart[] | undefined> {
  const presigned = await getPresignFromTransferContext({
    context: context,
    body: {
      purpose: "original",
      byteSize: context.file.size,
    },
  });
  if (presigned.mode === "multipart") {
    return _sendParts({ context: context, presigned: presigned });
  }
  const lease = getSingleLeaseFromPresign({
    context: context,
    presigned: presigned,
  });
  await putUploadBytes({
    request: {
      context,
      lease,
      headers: lease.headers,
      body: context.file,
      // A single PUT that expired restarts whole, which is why anything large
      // is multipart (`appConfig.upload.multipartThresholdBytes`).
      represign: () => {
        return getSingleLeaseFromTransferContext({
          context: context,
          purpose: "original",
        });
      },
    },
  });
  return undefined;
}
