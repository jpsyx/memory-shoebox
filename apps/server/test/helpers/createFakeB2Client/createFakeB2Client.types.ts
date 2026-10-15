import type {
  B2Client,
  B2Object,
  BucketCorsRule,
  HeadObjectResult,
} from "../../../src/b2/createB2Client/createB2Client.types.ts";

/** Mutable in-memory object, multipart and operation records shared by one fake storage client. */
export type FakeB2State = Pick<
  FakeB2Client,
  | "deletedKeys"
  | "failingKeys"
  | "objects"
  | "storedObjects"
  | "multipartObjects"
  | "multipartUploads"
  | "calls"
> & { openedUploadCount: number };

/** A `B2Client` that records what it was asked to do and talks to nothing. */
export type FakeB2Client = B2Client & {
  deletedKeys: string[];
  /** Keys that will throw when deleted, so a retry path can be exercised. */
  failingKeys: Set<string>;
  objects: Map<string, B2Object>;
  /**
   * What `headObject` answers, by key. A key absent here is Backblaze's 404,
   * so a test that wants a transfer to have landed puts it here first.
   */
  storedObjects: Map<string, HeadObjectResult>;
  /**
   * What a successful `completeMultipart` assembles, by key: Backblaze joins
   * the parts into one object, which `headObject` then answers for. A key
   * absent here assembles nothing, so a test that completes a multipart
   * upload and expects it to land says what landed.
   */
  multipartObjects: Map<string, HeadObjectResult>;
  /** Incomplete uploads indexed by provider ID, including unpersisted initiations. */
  multipartUploads: Map<string, { key: string }>;
  /** Every operation called, by name, in the order it was called. */
  calls: string[];
  /**
   * When true, every operation that would reach the network rejects, which
   * is how a route's `503 upload_storage_unavailable` is reached. The two
   * presigners and `signParts` keep working: they are local HMAC work.
   */
  isUnavailable: boolean;
  /** The bucket's CORS rules, as `getBucketCors` reads them. */
  corsRules: BucketCorsRule[];
  /**
   * Called with the operation's name before every operation runs. A test
   * that throws from it fails the call, which is how a test asserts that no
   * Backblaze call happens while a transaction is open.
   */
  onCall: ((operation: string) => void) | undefined;
};

/** Operation-recording inputs, including whether provider unavailability should reject the call. */
export type RecordFakeB2OperationOptions = {
  client: FakeB2Client;
  calls: string[];
  operation: string;
  isNetworkCall: boolean;
};
