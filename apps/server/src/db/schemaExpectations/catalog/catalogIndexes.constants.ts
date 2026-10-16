import type { IndexInfo } from "../../schemaIntrospectionHelpers.ts";
import { indexColumns } from "../indexColumns.ts";
import type { CatalogTable } from "./catalog.types.ts";

/** Every declared index on a catalog table. See `EXPECTED_INDEXES`. */
export const CATALOG_INDEXES: Record<CatalogTable, IndexInfo[]> = {
  item_burst_history: [
    {
      name: "item_burst_history__burst",
      columns: indexColumns("burst_id"),
      isUnique: false,
    },
    {
      name: "item_burst_history__cover",
      columns: indexColumns("cover_item_id"),
      isUnique: false,
    },
    {
      name: "item_burst_history__session",
      columns: indexColumns("upload_session_id"),
      isUnique: false,
    },
  ],
  items: [
    // `items_captured_on_rule_id` is the timeline's covering index and its
    // column order is load-bearing: the group-by runs in index order, the
    // visibility filter is checked inside the index, and a `LIMIT 30` stops
    // early without touching the table. Rebuilt on any other columns it
    // would still exist, still be named the same, and stop covering.
    // `items_rule_captured_on` is its mirror, kept so the planner can choose.
    {
      name: "items_burst_index",
      columns: indexColumns("burst_id", "burst_index"),
      isUnique: false,
    },
    {
      name: "items_captured_on_rule_id",
      columns: indexColumns("captured_on desc", "visibility_rule_id", "id"),
      isUnique: false,
    },
    {
      name: "items_checksum",
      columns: indexColumns("checksum"),
      isUnique: false,
    },
    {
      name: "items_navigation_burst_capture",
      columns: indexColumns(
        "burst_id",
        "captured_on",
        "captured_at",
        "seq",
        "id",
      ),
      isUnique: false,
    },
    {
      name: "items_navigation_burst_frame",
      columns: indexColumns("burst_id", "burst_index", "id"),
      isUnique: false,
    },
    {
      name: "items_navigation_capture",
      columns: indexColumns("captured_on desc", "captured_at", "seq", "id"),
      isUnique: false,
    },

    {
      name: "items_rule_captured_on",
      columns: indexColumns("visibility_rule_id", "captured_on"),
      isUnique: false,
    },
    // UNIQUE, because `seq` is the monotonic arrival order the unseen
    // comparisons read. Two items sharing a `seq` makes that comparison
    // ambiguous and nothing else notices.
    {
      name: "items_seq",
      columns: indexColumns("seq"),
      isUnique: true,
    },
    {
      name: "items_session_captured",
      columns: indexColumns("upload_session_id", "captured_on", "captured_at"),
      isUnique: false,
    },
    {
      name: "items_uploaded_by",
      columns: indexColumns("uploaded_by"),
      isUnique: false,
    },
    {
      name: "items_uploaded_by_captured_on",
      columns: indexColumns("uploaded_by", "captured_on"),
      isUnique: false,
    },
    // SQLite omits expression names; upgrade tests prove each indexed probe.
    ...[0, 1, 2, 3].map((band) => {
      return {
        name: `items_visual_fingerprint_band_${band}`,
        columns: [],
        isUnique: false,
      };
    }),
  ],
  // Migration 0017 preserves these relationships and indexes during rebuild.
  item_renditions: [
    // Both unique, so a double upload cannot point two rows at one object and
    // make deletion ambiguous.
    {
      name: "item_renditions_item_purpose",
      columns: indexColumns("item_id", "purpose"),
      isUnique: true,
    },
    {
      name: "item_renditions_storage_key",
      columns: indexColumns("storage_key"),
      isUnique: true,
    },
  ],
  bursts: [
    // Not in the document's index list. Migration 0003 added it so that
    // dissolving a burst, which fires `ON DELETE SET NULL` on every cover
    // reference, does not scan the whole table.
    {
      name: "bursts_cover_item",
      columns: indexColumns("cover_item_id"),
      isUnique: false,
    },
    // Not in the document's index list either. Migration 0008 added it for the
    // same reason one migration later than it should have been: the
    // `upload_session_id` RESTRICT still has to look before it refuses, so a
    // session purge without this scans every burst.
    {
      name: "bursts_upload_session",
      columns: indexColumns("upload_session_id"),
      isUnique: false,
    },
  ],
  milestones: [
    // For the overlap predicate. Not unique, and the document says why: two
    // "Mateo's birthday" milestones a year apart are both correct.
    {
      name: "milestones_span",
      columns: indexColumns("starts_on", "ends_on"),
      isUnique: false,
    },
  ],
  item_milestones: [
    {
      name: "item_milestones_item_milestone",
      columns: indexColumns("item_id", "milestone_id"),
      isUnique: true,
    },
    {
      name: "item_milestones_milestone_item",
      columns: indexColumns("milestone_id", "item_id"),
      isUnique: false,
    },
  ],
  item_capture_date_changes: [
    // Not in the document's index list. Migration 0003 added it for the audit
    // trail's own read, which is "this item's changes, newest first".
    {
      name: "item_capture_date_changes_item_changed",
      columns: indexColumns("item_id", "changed_at desc"),
      isUnique: false,
    },
    // Not in the document's index list. Migration 0008 added it because the
    // `milestone_id` SET NULL fires on a milestone delete the API promises
    // nothing blocks, against a table that grows with the archive, and the
    // index above leads with `item_id` and so cannot serve it. Partial: only a
    // `milestone_reconcile` row carries a milestone at all.
    {
      name: "item_capture_date_changes_milestone",
      columns: indexColumns("milestone_id"),
      isUnique: false,
    },
  ],
  tags: [],
  item_tags: [
    // Indexed both ways so a multi-filter query can drive from whichever
    // predicate is most selective. Only the forward direction is unique.
    {
      name: "item_tags_item_tag",
      columns: indexColumns("item_id", "tag_id"),
      isUnique: true,
    },
    {
      name: "item_tags_tag_item",
      columns: indexColumns("tag_id", "item_id"),
      isUnique: false,
    },
  ],
  people: [
    // The partial unique that stops two person records claiming one account,
    // without stopping many people from having no account at all.
    {
      name: "people_member",
      columns: indexColumns("member_id"),
      isUnique: true,
    },
  ],
  item_people: [
    {
      name: "item_people_item_person",
      columns: indexColumns("item_id", "person_id"),
      isUnique: true,
    },
    {
      name: "item_people_person_item",
      columns: indexColumns("person_id", "item_id"),
      isUnique: false,
    },
  ],
};
