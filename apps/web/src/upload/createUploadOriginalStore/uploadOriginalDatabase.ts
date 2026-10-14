/** A stalled browser database must not prevent an upload from starting. */
const STORAGE_TIMEOUT_MS = 10_000;

/** Opens only this feature's database and closes late/obsolete connections. */
export function openUploadOriginalDatabase(
  factory: IDBFactory,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open("memory-shoebox-upload-originals", 1);
    let isFinished = false;
    const fail = (error: unknown) => {
      isFinished = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      fail(new Error("Upload storage timed out."));
    }, STORAGE_TIMEOUT_MS);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("originals", {
        keyPath: ["memberId", "sessionId", "fileId"],
      });
      store.createIndex("session", ["memberId", "sessionId"]);
      store.createIndex("savedAt", "savedAt");
    };
    request.onerror = () => {
      fail(request.error);
    };
    request.onblocked = () => {
      fail(new Error("Upload storage is unavailable."));
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (isFinished) {
        request.result.close();
        return;
      }
      isFinished = true;
      request.result.onversionchange = () => {
        request.result.close();
      };
      resolve(request.result);
    };
  });
}

/** Awaits commit, not just an individual request's success. */
export function runUploadOriginalTransaction(
  options: Readonly<{
    database: IDBDatabase;
    mode: IDBTransactionMode;
    action: (store: IDBObjectStore) => void;
  }>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = options.database.transaction("originals", options.mode);
    const timer = setTimeout(() => {
      transaction.abort();
      reject(new Error("Upload storage timed out."));
    }, STORAGE_TIMEOUT_MS);
    transaction.oncomplete = () => {
      clearTimeout(timer);
      resolve();
    };
    transaction.onabort = () => {
      clearTimeout(timer);
      reject(transaction.error ?? new Error("Upload storage was interrupted."));
    };
    try {
      options.action(transaction.objectStore("originals"));
    } catch (error) {
      clearTimeout(timer);
      transaction.abort();
      reject(error);
    }
  });
}
