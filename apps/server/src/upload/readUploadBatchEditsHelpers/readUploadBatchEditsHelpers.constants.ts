/** The columns `EditRow` is read from, in its order. */
export const EDIT_ROW_COLUMNS = [
  "upload_batch_edits.id as editId",
  "upload_batch_edits.kind as kind",
  "upload_batch_edits.label_snapshot as labelSnapshot",
  "upload_batch_edits.created_at as createdAt",
  "upload_batch_edits.undone_at as undoneAt",
  "upload_batch_edits.applied_at as appliedAt",
  "tags.id as tagId",
  "tags.name as tagName",
  "people.id as personId",
  "people.display_name as personName",
  "milestones.id as milestoneId",
  "milestones.name as milestoneName",
  "milestones.starts_on as milestoneStartsOn",
  "milestones.ends_on as milestoneEndsOn",
  "milestones.blurb as milestoneBlurb",
] as const;
