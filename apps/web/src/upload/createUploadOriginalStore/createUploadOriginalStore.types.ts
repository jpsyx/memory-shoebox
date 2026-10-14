/** The signed-in member and server batch owning temporary originals. */
export type UploadOriginalScope = { memberId: string; sessionId: string };

/** Temporary originals; failures are handled by the upload controller. */
export type UploadOriginalStore = {
  /** Saves each file independently, preserving earlier writes on quota failure. */
  saveFiles: (
    options: Readonly<
      UploadOriginalScope & { filesById: ReadonlyMap<string, File> }
    >,
  ) => Promise<void>;
  /** Reconstructs this member's files for one authorized batch. */
  readFiles: (
    scope: Readonly<UploadOriginalScope>,
  ) => Promise<Map<string, File>>;
  /** Removes confirmed or excluded originals without touching other batches. */
  removeFiles: (
    options: Readonly<UploadOriginalScope & { fileIds: readonly string[] }>,
  ) => Promise<void>;
  /** Forgets one explicitly discarded local batch. */
  clearSession: (scope: Readonly<UploadOriginalScope>) => Promise<void>;
};

/** Blob plus explicit metadata survives browsers that clone File as Blob. */
export type StoredUploadOriginal = UploadOriginalScope & {
  fileId: string;
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
  savedAt: number;
};

/** Injectable browser database and clock for storage lifecycle tests. */
export type UploadOriginalStoreOptions = {
  indexedDB?: IDBFactory;
  now?: () => number;
};
