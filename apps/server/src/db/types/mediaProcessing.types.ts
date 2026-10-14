import type { Generated } from "kysely";

/** Durable work identity; source revision remains after a rendition replacement. */
export type MediaProcessingJobsTable = {
  id: string;
  item_id: string;
  source_rendition_id: string;
  recipe: string;
  state: "pending" | "running" | "complete" | "unavailable";
  priority: number;
  attempts: Generated<number>;
  next_attempt_at: string;
  lease_token: string | null;
  lease_expires_at: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};

/** Object ownership outlives jobs/items so abandoned uploads remain recoverable. */
export type MediaProcessingOutputsTable = {
  id: string;
  job_id: string | null;
  item_id: string | null;
  attempt_token: string;
  storage_key: string;
  purpose: string;
  state: "reserved" | "uploading" | "uploaded" | "published" | "cleanup";
  multipart_upload_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Singleton catalog position; deleting the scanned item leaves progress intact. */
export type MediaProcessingDiscoveryTable = {
  id: number;
  cursor_item_id: string | null;
  updated_at: string;
};
