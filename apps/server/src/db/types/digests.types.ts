/** Durable notification digest events row. */
export type NotificationDigestEventsTable = {
  id: string;
  member_id: string;
  category: "upload" | "comment" | "comment_tag";
  source_kind: "upload_session" | "comment";
  source_id: string;
  occurred_at: string;
  deduplication_key: string;
  state: "pending" | "included" | "cancelled";
  batch_id: string | null;
};

/** Durable notification digest batches row. */
export type NotificationDigestBatchesTable = {
  id: string;
  member_id: string;
  send_date: string;
  timezone: string;
  cutoff_local_date: string;
  prepared_at: string;
  outbound_email_id: string | null;
  eligibility_snapshot_json: string | null;
  delivery_snapshot_json: string | null;
  provider_attempted_at: string | null;
};
