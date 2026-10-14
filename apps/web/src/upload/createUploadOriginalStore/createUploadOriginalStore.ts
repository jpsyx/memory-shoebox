import type {
  StoredUploadOriginal,
  UploadOriginalScope,
  UploadOriginalStore,
  UploadOriginalStoreOptions,
} from "./createUploadOriginalStore.types";
import {
  openUploadOriginalDatabase,
  runUploadOriginalTransaction,
} from "./uploadOriginalDatabase";

/** Abandoned local copies expire after seven days, independently of server state. */
const ORIGINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

function _isStoredOriginal(value: unknown): value is StoredUploadOriginal {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Partial<StoredUploadOriginal>;
  return (
    typeof record.memberId === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.fileId === "string" &&
    typeof record.name === "string" &&
    typeof record.type === "string" &&
    typeof record.lastModified === "number" &&
    typeof record.savedAt === "number" &&
    record.blob instanceof Blob
  );
}

async function _withDatabase<T>(
  options: Readonly<{
    dependencies: UploadOriginalStoreOptions;
    action: (database: IDBDatabase) => Promise<T>;
  }>,
): Promise<T> {
  const factory = options.dependencies.indexedDB ?? globalThis.indexedDB;
  if (!factory) {
    throw new Error("Upload storage is unavailable.");
  }
  const database = await openUploadOriginalDatabase(factory);
  try {
    await runUploadOriginalTransaction({
      database,
      mode: "readwrite",
      action: (store) => {
        const cutoff =
          (options.dependencies.now?.() ?? Date.now()) - ORIGINAL_RETENTION_MS;
        const request = store.index("savedAt").openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor && Number(cursor.key) < cutoff) {
            cursor.delete();
            cursor.continue();
          }
        };
      },
    });
    return await options.action(database);
  } finally {
    database.close();
  }
}

async function _readFiles(
  options: Readonly<{
    database: IDBDatabase;
    scope: UploadOriginalScope;
  }>,
): Promise<Map<string, File>> {
  const files = new Map<string, File>();
  await runUploadOriginalTransaction({
    database: options.database,
    mode: "readonly",
    action: (store) => {
      const request = store
        .index("session")
        .openCursor([options.scope.memberId, options.scope.sessionId]);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          return;
        }
        const record: unknown = cursor.value;
        if (_isStoredOriginal(record)) {
          files.set(
            record.fileId,
            new File([record.blob], record.name, {
              type: record.type,
              lastModified: record.lastModified,
            }),
          );
        }
        cursor.continue();
      };
    },
  });
  return files;
}

async function _saveFiles(
  options: Readonly<{
    database: IDBDatabase;
    scope: Parameters<UploadOriginalStore["saveFiles"]>[0];
    now: () => number;
  }>,
): Promise<void> {
  await [...options.scope.filesById].reduce(
    async (previousSave, [fileId, file]) => {
      await previousSave;
      const record: StoredUploadOriginal = {
        memberId: options.scope.memberId,
        sessionId: options.scope.sessionId,
        fileId,
        blob: file.slice(),
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        savedAt: options.now(),
      };
      await runUploadOriginalTransaction({
        database: options.database,
        mode: "readwrite",
        action: (store) => {
          store.put(record);
        },
      });
    },
    Promise.resolve(),
  );
}

function _removeFiles(
  database: IDBDatabase,
  options: Parameters<UploadOriginalStore["removeFiles"]>[0],
): Promise<void> {
  return runUploadOriginalTransaction({
    database,
    mode: "readwrite",
    action: (store) => {
      options.fileIds.forEach((fileId) => {
        store.delete([options.memberId, options.sessionId, fileId]);
      });
    },
  });
}

function _clearSession(
  database: IDBDatabase,
  scope: Readonly<UploadOriginalScope>,
): Promise<void> {
  return runUploadOriginalTransaction({
    database,
    mode: "readwrite",
    action: (store) => {
      const request = store
        .index("session")
        .openCursor([scope.memberId, scope.sessionId]);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    },
  });
}

/** Native IndexedDB storage, scoped by member, batch and server file id. */
export function createUploadOriginalStore(
  dependencies: Readonly<UploadOriginalStoreOptions> = {},
): UploadOriginalStore {
  const withDatabase = <T>(action: (database: IDBDatabase) => Promise<T>) => {
    return _withDatabase({ dependencies, action });
  };
  return {
    saveFiles: (scope) => {
      return withDatabase((database) => {
        return _saveFiles({
          database,
          scope,
          now: dependencies.now ?? Date.now,
        });
      });
    },
    readFiles: (scope) => {
      return withDatabase((database) => {
        return _readFiles({ database, scope });
      });
    },
    removeFiles: (options) => {
      return withDatabase((database) => {
        return _removeFiles(database, options);
      });
    },
    clearSession: (scope) => {
      return withDatabase((database) => {
        return _clearSession(database, scope);
      });
    },
  };
}
