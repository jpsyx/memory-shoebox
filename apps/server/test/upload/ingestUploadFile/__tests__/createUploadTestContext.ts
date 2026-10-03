import type { Kysely, Selectable } from "kysely";
import { createHash } from "node:crypto";

import { createDatabase } from "../../../../src/db/client.ts";
import { createId } from "../../../../src/db/createId.ts";
import { migrateToLatest } from "../../../../src/db/migrate.ts";
import type { Database } from "../../../../src/db/types/db.types.ts";
import { ingestUploadFile } from "../../../../src/upload/ingestUploadFile/ingestUploadFile.ts";
import { makeUploadStorageKeyFromRendition } from "../../../../src/upload/presignUploadFile/uploadStorageKeyHelpers.ts";
import type { UploadFileRow } from "../../../../src/upload/uploadSessionAccessHelpers.ts";
import {
  insertMember,
  insertUploadBatchEdit,
  insertUploadBatchEditTargets,
  insertUploadFile,
  insertUploadSession,
  insertVisibilityRule,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

/** One independently created upload test fixture. */
type FixtureContext = FixtureOperations & {
  database: ReturnType<typeof createDatabase>;
  memberId: string;
  ruleId: string;
  session: import("kysely").Selectable<Database["upload_sessions"]>;
};

/** makeOperationsFromFixtureContext inputs or output fields. */
type MakeOperationsFromFixtureContextShape = {
  sessionId: string;
  database: Kysely<Database>;
  session: Selectable<Database["upload_sessions"]>;
  memberId: string;
};

/** Operations bound to one independently created upload fixture. */
type FixtureOperations = {
  keyOf: (
    functionOptions: Readonly<{
      fileId: string;
      purpose: "original" | "thumb";
    }>,
  ) => string;
  seedFile: (
    functionOptions: Readonly<{
      position: number;
      overrides?: Partial<Database["upload_files"]>;
    }>,
  ) => Promise<UploadFileRow>;
  ingest: (
    functionOptions: Readonly<{
      file: UploadFileRow;
      dimensions?: {
        width: number;
        height: number;
        durationMs: number | undefined;
      };
    }>,
  ) => ReturnType<typeof ingestUploadFile>;
  planEdit: (options: {
    files: readonly UploadFileRow[];
    edit: Partial<Database["upload_batch_edits"]>;
  }) => Promise<string>;
  readEdit: (
    editId: string,
  ) => Promise<Selectable<Database["upload_batch_edits"]>>;
};

/** keyOf using this fixture's catalog and request context. */
function _keyOfForFixture(
  input: Readonly<{
    context: { sessionId: string };
    argument: Readonly<{ fileId: string; purpose: "original" | "thumb" }>;
  }>,
): string {
  const { sessionId } = input.context;
  const functionOptions = input.argument;

  const { fileId, purpose } = functionOptions;

  return makeUploadStorageKeyFromRendition({
    sessionId,
    fileId,
    purpose,
    declaredContentType: "image/jpeg",
  });
}

/** seedFile using this fixture's catalog and request context. */
async function _seedFileForFixture(
  input: Readonly<{
    context: {
      database: Kysely<Database>;
      sessionId: string;
      keyOf: FixtureOperations["keyOf"];
    };
    argument: Parameters<FixtureOperations["seedFile"]>[0];
  }>,
): Promise<UploadFileRow> {
  const { database, sessionId, keyOf } = input.context;
  const functionOptions = input.argument;

  const { position, overrides = {} } = functionOptions;

  const fileId = createId();
  await insertUploadFile(database, {
    id: fileId,
    uploadSessionId: sessionId,
    position,
    state: "sending",
    original_filename: `IMG_000${position}.jpg`,
    declared_bytes: 2_400_000,
    content_hash: createHash("sha256").update(`file-${position}`).digest("hex"),
    storage_key: keyOf({ fileId: fileId, purpose: "original" }),
    captured_at: "2026-09-14T04:41:32.000Z",
    capture_date: "2026-09-14",
    capture_offset_minutes: 120,
    // Amended before commit: the date a person chose, over what the file said.
    capture_source: "uploader_set",
    original_captured_at: "2026-09-13T04:41:32.000Z",
    ...overrides,
  });
  return database
    .selectFrom("upload_files")
    .selectAll()
    .where("id", "=", fileId)
    .executeTakeFirstOrThrow();
}

/** ingest using this fixture's catalog and request context. */
function _ingestForFixture(
  input: Readonly<{
    context: {
      database: Kysely<Database>;
      session: Selectable<Database["upload_sessions"]>;
      keyOf: FixtureOperations["keyOf"];
    };
    argument: Parameters<FixtureOperations["ingest"]>[0];
  }>,
): ReturnType<typeof ingestUploadFile> {
  const { database, session, keyOf } = input.context;
  const functionOptions = input.argument;

  const {
    file,
    dimensions = {
      width: 3024,
      height: 4032,
      durationMs: undefined,
    },
  } = functionOptions;

  return ingestUploadFile({
    transaction: database,
    session,
    file,
    dimensions,
    renditions: [
      {
        purpose: "original",
        storageKey: keyOf({ fileId: file.id, purpose: "original" }),
        contentType: "image/jpeg",
        byteSize: file.declared_bytes,
        width: 3024,
        height: 4032,
      },
      {
        purpose: "thumb",
        storageKey: keyOf({ fileId: file.id, purpose: "thumb" }),
        contentType: "image/jpeg",
        byteSize: 40_000,
        width: 360,
        height: 480,
      },
    ],
    now: NOW,
  });
}

/** planEdit using this fixture's catalog and request context. */
async function _planEditForFixture(
  input: Readonly<{
    context: {
      database: Kysely<Database>;
      sessionId: string;
      memberId: string;
    };
    argument: {
      files: readonly UploadFileRow[];
      edit: Partial<Database["upload_batch_edits"]>;
    };
  }>,
): Promise<string> {
  const { database, sessionId, memberId } = input.context;
  const options = input.argument;

  const editId = await insertUploadBatchEdit({
    database: database,
    options: {
      uploadSessionId: sessionId,
      createdBy: memberId,
      ...options.edit,
    },
  });
  await insertUploadBatchEditTargets({
    database: database,
    options: {
      editId,
      fileIds: options.files.map((file) => {
        return file.id;
      }),
    },
  });
  return editId;
}

/** readEdit using this fixture's catalog and request context. */
function _readEditForFixture(
  input: Readonly<{
    context: { database: Kysely<Database> };
    argument: string;
  }>,
): Promise<Selectable<Database["upload_batch_edits"]>> {
  const { database } = input.context;
  const editId = input.argument;

  return database
    .selectFrom("upload_batch_edits")
    .selectAll()
    .where("id", "=", editId)
    .executeTakeFirstOrThrow();
}

/** Binds upload operations to one fixture without sharing live resources. */
function _makeOperationsFromFixtureContext(
  context: Readonly<MakeOperationsFromFixtureContextShape>,
): FixtureOperations {
  const { sessionId, database, session, memberId } = context;
  const keyOf = (
    functionOptions: Parameters<FixtureOperations["keyOf"]>[0],
  ) => {
    return _keyOfForFixture({
      context: { sessionId },
      argument: functionOptions,
    });
  };
  const seedFile = (
    functionOptions: Parameters<FixtureOperations["seedFile"]>[0],
  ) => {
    return _seedFileForFixture({
      context: { database, sessionId, keyOf },
      argument: functionOptions,
    });
  };
  const ingest = (
    functionOptions: Parameters<FixtureOperations["ingest"]>[0],
  ) => {
    return _ingestForFixture({
      context: { database, session, keyOf },
      argument: functionOptions,
    });
  };
  const planEdit = (options: Parameters<FixtureOperations["planEdit"]>[0]) => {
    return _planEditForFixture({
      context: { database, sessionId, memberId },
      argument: options,
    });
  };
  const readEdit = (editId: string) => {
    return _readEditForFixture({ context: { database }, argument: editId });
  };
  return { keyOf, seedFile, ingest, planEdit, readEdit };
}

/**
 * Creates an ingest fixture with a session, visibility rule and edit
 * helpers.
 */
export async function createUploadTestContext(): Promise<FixtureContext> {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const ruleId = await insertVisibilityRule(database, { mode: "only" });
  const sessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
    visibility_rule_id: ruleId,
  });
  const session = await database
    .selectFrom("upload_sessions")
    .selectAll()
    .where("id", "=", sessionId)
    .executeTakeFirstOrThrow();
  const { keyOf, seedFile, ingest, planEdit, readEdit } =
    _makeOperationsFromFixtureContext({
      sessionId,
      database,
      session,
      memberId,
    });
  return {
    database,
    memberId,
    ruleId,
    session,
    keyOf,
    seedFile,
    ingest,
    planEdit,
    readEdit,
  };
}
