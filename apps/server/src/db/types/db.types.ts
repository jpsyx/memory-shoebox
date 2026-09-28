import type {
  ItemCaptureDateChangesTable,
  ItemMilestonesTable,
  ItemPeopleTable,
  ItemRenditionsTable,
  ItemTagsTable,
  ItemsTable,
  BurstsTable,
  MilestonesTable,
  PeopleTable,
  TagsTable,
} from "./catalog.types.ts";
import type {
  GroupMembersTable,
  GroupsTable,
  InvitationsTable,
  MembersTable,
  SessionsTable,
  SignInCodesTable,
  VisibilityRuleSubjectsTable,
  VisibilityRulesTable,
} from "./identityAndAccess.types.ts";
import type {
  CommentReactionsTable,
  CommentsTable,
  ItemReactionsTable,
  RemovalRequestsTable,
} from "./moderation.types.ts";
import type {
  ActivityEventsTable,
  EmailDeliveryEventsTable,
  EmailSuppressionsTable,
  ItemViewsTable,
  OutboundEmailsTable,
  SettingsTable,
} from "./operations.types.ts";
import type {
  PendingObjectDeletionsTable,
  UploadBatchEditTargetsTable,
  UploadBatchEditsTable,
  UploadFilesTable,
  UploadSessionsTable,
} from "./upload.types.ts";

/**
 * The SQLite schema as Kysely sees it: one property per table, mapping the
 * table name to the shape of a row. Every table added by a migration under
 * `src/db/migrations/` gets a matching entry here, and Kysely then type-checks
 * every query against it.
 */
export type Database = {
  members: MembersTable;
  sign_in_codes: SignInCodesTable;
  sessions: SessionsTable;
  invitations: InvitationsTable;
  groups: GroupsTable;
  group_members: GroupMembersTable;
  visibility_rules: VisibilityRulesTable;
  visibility_rule_subjects: VisibilityRuleSubjectsTable;
  items: ItemsTable;
  item_renditions: ItemRenditionsTable;
  bursts: BurstsTable;
  milestones: MilestonesTable;
  item_milestones: ItemMilestonesTable;
  item_capture_date_changes: ItemCaptureDateChangesTable;
  tags: TagsTable;
  item_tags: ItemTagsTable;
  people: PeopleTable;
  item_people: ItemPeopleTable;
  comments: CommentsTable;
  item_reactions: ItemReactionsTable;
  comment_reactions: CommentReactionsTable;
  removal_requests: RemovalRequestsTable;
  upload_sessions: UploadSessionsTable;
  upload_files: UploadFilesTable;
  upload_batch_edits: UploadBatchEditsTable;
  upload_batch_edit_targets: UploadBatchEditTargetsTable;
  pending_object_deletions: PendingObjectDeletionsTable;
  settings: SettingsTable;
  outbound_emails: OutboundEmailsTable;
  email_delivery_events: EmailDeliveryEventsTable;
  email_suppressions: EmailSuppressionsTable;
  item_views: ItemViewsTable;
  activity_events: ActivityEventsTable;
};
