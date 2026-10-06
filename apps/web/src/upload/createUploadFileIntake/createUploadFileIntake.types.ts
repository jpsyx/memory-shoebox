/** Transient original handles staged between a timeline drop and Upload. */
export type UploadFileIntake = {
  stageFiles: (files: readonly File[]) => void;
  getPendingFileCount: () => number;
  loadSession: (sessionId?: string) => Promise<void>;
};
