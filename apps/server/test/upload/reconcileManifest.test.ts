import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ManifestEntry } from "@memory-shoebox/shared";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { reconcileManifest } from "../../src/upload/reconcileManifest/reconcileManifest.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import {
  insertMember,
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

function _makeEntry(clientRef: string): ManifestEntry {
  return {
    clientRef,
    originalFilename: `IMG_${clientRef}.jpg`,
    declaredContentType: "image/jpeg",
    declaredBytes: 2_400_000,
    contentHash: ((seed: string): string => {
      return createHash("sha256").update(seed).digest("hex");
    })(clientRef),
  };
}

async function _createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const sessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
    state: "draft",
    committed_at: null,
    file_count: 0,
    total_bytes: 0,
  });
  const session = await database
    .selectFrom("upload_sessions")
    .selectAll()
    .where("id", "=", sessionId)
    .executeTakeFirstOrThrow();
  return { database, session };
}

describe("reconcileManifest", () => {
  it("costs the same statements for three files as for thirty", async () => {
    const countStatementsFor = async (fileCount: number): Promise<number> => {
      const { database, session } = await _createContext();
      const first = await reconcileManifest({
        transaction: database,
        session,
        entries: Array.from({ length: fileCount }, (_unused, index) => {
          return _makeEntry(`first-${index}`);
        }),
        timezone: "UTC",
        now: NOW,
      });
      const counting = makeQueryCountingDatabaseFromDatabase(database);
      counting.reset();

      // Every kind of entry at once: re-declared by hash, amended by id, and
      // new, so the count covers the insert and the update together.
      await reconcileManifest({
        transaction: counting.database,
        session,
        entries: first.outcomes.flatMap((outcome, index) => {
          return [
            _makeEntry(`first-${index}`),
            {
              ..._makeEntry(`fix-${index}`),
              fileId: outcome.fileId,
              capturedAt: "2026-09-16T04:41:32.000Z",
            },
            _makeEntry(`second-${index}`),
          ];
        }),
        timezone: "UTC",
        now: NOW,
      });

      const statementCount = counting.getQueryCount();
      await database.destroy();
      return statementCount;
    };

    expect(await countStatementsFor(30)).toBe(await countStatementsFor(3));
  });

  it("lets one unsent row be claimed by name once, never by two files", async () => {
    const { database, session } = await _createContext();
    const unsentId = await insertUploadFile(database, {
      uploadSessionId: session.id,
      position: 1,
      original_filename: "IMG_0001.jpg",
      declared_bytes: 1024,
    });

    // Same name and size, different bytes: two files from two folders.
    const result = await reconcileManifest({
      transaction: database,
      session,
      entries: [
        {
          ..._makeEntry("first"),
          originalFilename: "IMG_0001.jpg",
          declaredBytes: 1024,
        },
        {
          ..._makeEntry("second"),
          originalFilename: "IMG_0001.jpg",
          declaredBytes: 1024,
        },
      ],
      timezone: "UTC",
      now: NOW,
    });

    expect(
      result.outcomes.map((outcome) => {
        return [outcome.disposition, outcome.fileId === unsentId];
      }),
    ).toEqual([
      ["matched", true],
      ["created", false],
    ]);
    await database.destroy();
  });
});
