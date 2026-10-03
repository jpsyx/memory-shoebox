import type { MemberRole } from "@memory-shoebox/shared";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

/** How many of the batch's items one rule covers on one day. */
export type RuleDayCount = {
  ruleId: string;
  capturedOn: string;
  itemCount: number;
};

/** One member who may hear about the batch, before the intersection. */
export type Candidate = {
  memberId: string;
  email: string;
  displayName: string;
  role: MemberRole;
};

/** One recipient's own figures, which is all that differs between copies. */
export type RecipientFigures = {
  visibleItemCount: number;
  capturedOn: string;
  visibleDayCount: number;
  firstCapturedOn: string;
  lastCapturedOn: string;
};

/** A candidate who can see at least one item, with what they can see. */
export type Recipient = {
  candidate: Candidate;
  figures: RecipientFigures;
};

/** What every copy of the message shares. */
export type UploadEmailContext = {
  sessionId: string;
  uploaderDisplayName: string;
  baseUrl: string;
  milestoneNamesByDay: Map<string, string>;
  now: string;
};

/** What `enqueueUploadSessionEmails` is given. */
export type EnqueueUploadSessionEmailsOptions = {
  transaction: DatabaseExecutor;
  sessionId: string;
  uploadedBy: string;
  now: string;
};
