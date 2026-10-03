import {
  UPLOAD_LIMITS,
  type UploadFileDto,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { getUploadSession } from "../uploadsHelpers";
import type { GetWholeUploadSessionOptions } from "./getWholeUploadSession.types";

/**
 * Reads all requested manifest rows in position order, deduplicating by id.
 * A failed page rejects the whole read; callers keep their displayed detail.
 */
export async function getWholeUploadSession(
  options: Readonly<GetWholeUploadSessionOptions>,
): Promise<UploadSessionDetail> {
  const { read = getUploadSession, ...readOptions } = options;
  const filesById = new Map<string, UploadFileDto>();
  const visitedCursors = new Set<string>();
  const readPage = async (cursor?: string): Promise<UploadSessionDetail> => {
    if (cursor !== undefined) {
      if (visitedCursors.has(cursor)) {
        throw new Error("Upload session returned a repeated cursor.");
      }
      visitedCursors.add(cursor);
    }
    const page = await read({
      ...readOptions,
      cursor,
      limit: UPLOAD_LIMITS.detailPageMax,
    });
    page.files.forEach((file) => {
      filesById.set(file.fileId, file);
    });
    if (page.nextCursor !== null) {
      return readPage(page.nextCursor);
    }
    return {
      ...page,
      files: [...filesById.values()].sort((left, right) => {
        return left.position - right.position;
      }),
      nextCursor: null,
    };
  };
  return readPage(options.cursor);
}
