/** Transient original handles staged between a timeline drop and Upload. */
export type UploadFileIntake = {
  stageFiles: (files: readonly File[]) => void;
  getPendingFileCount: () => number;
  /** Releases staged originals and invalidates pending intake work. */
  clear: () => void;
  loadSession: (sessionId?: string) => Promise<void>;
};
