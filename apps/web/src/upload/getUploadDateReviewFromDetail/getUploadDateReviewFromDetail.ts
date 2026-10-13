import { getUndatedUploadFilesFromDetail } from "./getUndatedUploadFilesFromDetail";
import type {
  UploadFileDto,
  UploadSessionDetail,
} from "@memory-shoebox/shared";

/** A proposed calendar day, requiring an explicit uploader confirmation. */
export type UploadDateReview = {
  file: UploadFileDto;
  capturedOn: string;
  basis:
    | "surrounding"
    | "previous"
    | "following"
    | "file_mtime"
    | "upload_time"
    | "unknown";
};

function _isDated(file: Readonly<UploadFileDto>): boolean {
  return Boolean(
    file.capturedOn &&
    file.captureSource &&
    file.captureSource !== "file_mtime" &&
    file.captureSource !== "upload_time",
  );
}

function _makeSuggestion(
  options: Readonly<{
    file: UploadFileDto;
    previousDay?: string;
    followingDay?: string;
  }>,
): UploadDateReview {
  const { file, previousDay, followingDay } = options;
  if (previousDay) {
    return {
      file,
      capturedOn: previousDay,
      basis: previousDay === followingDay ? "surrounding" : "previous",
    };
  }
  if (followingDay) {
    return { file, capturedOn: followingDay, basis: "following" };
  }
  return {
    file,
    capturedOn: file.capturedOn ?? "",
    basis:
      file.captureSource === "file_mtime" ||
      file.captureSource === "upload_time"
        ? file.captureSource
        : "unknown",
  };
}

function _getFollowingDaysFromFiles(
  files: readonly UploadFileDto[],
): Map<string, string | undefined> {
  const followingDays = new Map<string, string | undefined>();
  let followingDay: string | undefined;
  for (const file of files.toReversed()) {
    followingDays.set(file.fileId, followingDay);
    if (_isDated(file)) {
      followingDay = file.capturedOn!;
    }
  }
  return followingDays;
}

/**
 * Suggests days in received pick order, never promoting an unapproved guess
 * to evidence. Leading gaps use the next known day; other gaps use the prior
 * known day. Without either neighbor, the server's fallback remains a guess.
 */
export function getUploadDateReviewFromDetail(
  detail: Readonly<UploadSessionDetail>,
): UploadDateReview[] {
  const undatedIds = new Set(
    getUndatedUploadFilesFromDetail(detail).map((file) => {
      return file.fileId;
    }),
  );
  const files = detail.files
    .filter((file) => {
      return (
        file.state !== "refused" &&
        file.state !== "cancelled" &&
        !file.duplicateReason
      );
    })
    .sort((first, second) => {
      return first.position - second.position;
    });
  const followingDays = _getFollowingDaysFromFiles(files);
  let previousDay: string | undefined;
  const reviews: UploadDateReview[] = [];
  for (const file of files) {
    if (undatedIds.has(file.fileId)) {
      reviews.push(
        _makeSuggestion({
          file,
          previousDay,
          followingDay: followingDays.get(file.fileId),
        }),
      );
    }
    if (_isDated(file)) {
      previousDay = file.capturedOn!;
    }
  }
  return reviews;
}
