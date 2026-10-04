import type {
  CreateUploadEngineOptions,
  UploadEngine,
  UploadEngineEvent,
} from "@/upload/createUploadEngine/createUploadEngine.types";
import type { MediaWorkerPort } from "@/upload/mediaWorker/mediaWorkerProtocol.types";
import type {
  CompleteUploadFileResponse,
  ManifestEntry,
  UploadSessionDetail,
} from "@memory-shoebox/shared";
import type { Mock, Mocked } from "vitest";
import type {
  UploadRecoveryStorage,
  UploadSessionApi,
  UploadSessionController,
} from "../../createUploadSessionController.types";

/** Real controller with observable catalog, engine and local-file doubles. */
export type UploadControllerHarness = {
  controller: UploadSessionController;
  api: Mocked<UploadSessionApi>;
  engine: Mocked<UploadEngine>;
  pickedFiles: File[];
  headerReader: Mock<
    (
      options: Readonly<{ file: File; clientRef: string }>,
    ) => Promise<ManifestEntry>
  >;
  storage: UploadRecoveryStorage;
  emitEvent: (event: Readonly<UploadEngineEvent>) => void;
  serverDetail: UploadSessionDetail;
  getEngineOptions: () => CreateUploadEngineOptions | undefined;
  answerCompletion: (value: Readonly<CompleteUploadFileResponse>) => void;
  answerRun: (value: void) => void;
};

/**
 * Recovery controller with retained picks and an observable worker boundary.
 */
export type UploadRecoveryControllerHarness = UploadControllerHarness & {
  files: File[];
  worker: MediaWorkerPort;
};
