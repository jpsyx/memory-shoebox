import type { OutboundEmailKind } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../../../../src/db/types/db.types.ts";
import type { TestApp } from "../../../helpers/createTestApp.ts";
import type { insertOutboundEmail } from "../../../helpers/seedHelpers/seedHelpers.ts";

/** Requeue Fixture for retained mail scenarios. */
export type RequeueFixture = TestApp & {
  itemId: string;
  commentId: string;
  uploadId: string;
  requestId: string;
  invitationId: string;
};

/** Failure Options for retained mail scenarios. */
export type FailureOptions = {
  context: RequeueFixture;
  kind: OutboundEmailKind;
  payload: object;
  triggerId: string;
  triggerKind: "comment" | "upload_session" | "removal_request";
  overrides?: Parameters<typeof insertOutboundEmail>[1];
};

/** Retained Comment Failure Result for retained mail scenarios. */
export type RetainedCommentFailureResult = {
  context: RequeueFixture;
  uploadId: string;
  requestId: string;
  itemId: string;
  database: DatabaseExecutor;
  invitationId: string;
  comment: string;
  close: () => Promise<void>;
};

/** Frozen comment content used by terminal delivery failures. */
export type TerminalCommentPayload = {
  authorDisplayName: string;
  body: string;
  atSeconds: null;
  itemCapturedOn: string;
  itemUrl: string;
  relation: string;
  uploaderDisplayName: string;
};

/** Terminal Mail Failures Result for retained mail scenarios. */
export type TerminalMailFailuresResult = {
  atBoundary: string;
  payload: TerminalCommentPayload;
  itemId: string;
  context: RequeueFixture;
  commentId: string;
  database: DatabaseExecutor;
  eligible: string;
  close: () => Promise<void>;
};

/** Terminal Comment Failure Options for retained mail scenarios. */
export type TerminalCommentFailureOptions = {
  context: RequeueFixture;
  commentId: string;
  payload: TerminalMailFailuresResult["payload"];
  overridesList: ReadonlyArray<
    NonNullable<Parameters<typeof insertOutboundEmail>[1]>
  >;
};
