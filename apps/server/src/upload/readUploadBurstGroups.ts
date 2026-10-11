import type { UploadFileDto } from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { makeBurstsFromCandidates } from "./makeBurstsFromCandidates.ts";
import type { UploadFileRow } from "./uploadSessionAccessHelpers.ts";

type UploadBurstGroup = NonNullable<UploadFileDto["burst"]>;
type GroupOptions = { database: DatabaseExecutor; sessionId: string };
type PreviewFile = Pick<
  UploadFileRow,
  "id" | "capture_date" | "captured_at" | "burst_excluded" | "kind"
>;

function _makePreviewGroups(
  rows: readonly PreviewFile[],
): Map<string, UploadBurstGroup> {
  const candidates = rows.flatMap((row) => {
    return row.capture_date === null || row.captured_at === null
      ? []
      : [
          {
            itemId: row.id,
            capturedOn: row.capture_date,
            capturedAt: row.captured_at,
          },
        ];
  });
  const byId = new Map(
    rows.map((row) => {
      return [row.id, row];
    }),
  );
  const bursts = makeBurstsFromCandidates({ candidates, ...appConfig.burst });
  const groups = new Map<string, UploadBurstGroup>();
  bursts.forEach((burst) => {
    const photoCount = burst.itemIds.filter((itemId) => {
      return byId.get(itemId)?.burst_excluded !== 1;
    }).length;
    burst.itemIds.forEach((fileId) => {
      const file = byId.get(fileId);
      if (file?.kind === "photo") {
        groups.set(fileId, {
          groupId: burst.itemIds[0]!,
          photoCount,
          isExcluded: file.burst_excluded === 1,
        });
      }
    });
  });
  return groups;
}

type SettledBurstFile = {
  fileId: string;
  groupId: string;
  activeBurstId: string | null;
  kind: string;
  capturedOn: string;
  originalDay: string;
  activeDay: string | null;
};

function _makeSettledGroups(
  rows: readonly SettledBurstFile[],
): Map<string, UploadBurstGroup> {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    if (row.activeBurstId === row.groupId) {
      counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1);
    }
  });
  return new Map(
    rows
      .filter((row) => {
        return row.kind === "photo";
      })
      .map((row) => {
        return [
          row.fileId,
          {
            groupId: row.groupId,
            photoCount: counts.get(row.groupId) ?? 0,
            isExcluded: row.activeBurstId !== row.groupId,
            canRestore:
              row.activeBurstId === null &&
              row.capturedOn === row.originalDay &&
              (row.activeDay === null || row.activeDay === row.capturedOn),
          },
        ];
      }),
  );
}

async function _readSettledGroups(
  options: Readonly<GroupOptions>,
): Promise<Map<string, UploadBurstGroup>> {
  const rows = await options.database
    .selectFrom("upload_files")
    .innerJoin("items", "items.id", "upload_files.item_id")
    .innerJoin("item_burst_history", "item_burst_history.item_id", "items.id")
    .leftJoin("bursts", "bursts.id", "item_burst_history.burst_id")
    .select([
      "upload_files.id as fileId",
      "item_burst_history.burst_id as groupId",
      "items.burst_id as activeBurstId",
      "items.kind as kind",
      "items.captured_on as capturedOn",
      "item_burst_history.captured_on as originalDay",
      "bursts.captured_on as activeDay",
    ])
    .where("upload_files.upload_session_id", "=", options.sessionId)
    .execute();
  return _makeSettledGroups(rows);
}

/** Detects the entire manifest before file pagination or user exclusions. */
export async function readUploadBurstGroups(
  options: Readonly<GroupOptions>,
): Promise<Map<string, UploadBurstGroup>> {
  const session = await options.database
    .selectFrom("upload_sessions")
    .select("settled_at")
    .where("id", "=", options.sessionId)
    .executeTakeFirstOrThrow();
  if (session.settled_at !== null) {
    return _readSettledGroups(options);
  }
  const rows = await options.database
    .selectFrom("upload_files")
    .select(["id", "capture_date", "captured_at", "burst_excluded", "kind"])
    .where("upload_session_id", "=", options.sessionId)
    .where("capture_source", "in", ["exif", "video_metadata"])
    .where("state", "in", ["waiting", "sending", "done"])
    .where("duplicate_reason", "is", null)
    .execute();
  return _makePreviewGroups(rows);
}
