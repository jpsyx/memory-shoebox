import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../../visibility/applyVisibilityFilter.ts";
import { getDisplayNameFromMember } from "../../members/getDisplayNameFromMember.ts";
import type { EligibleDigestEvent } from "./digest.types.ts";

type SourceOptions = Readonly<{
  executor: DatabaseExecutor;
  viewer: Viewer;
  event: EligibleDigestEvent["event"];
}>;

async function _authorLabel(
  executor: DatabaseExecutor,
  authorId: string,
): Promise<string> {
  const author = await executor
    .selectFrom("members")
    .select(["display_name", "email"])
    .where("id", "=", authorId)
    .executeTakeFirst();
  return author
    ? getDisplayNameFromMember({
        storedDisplayName: author.display_name ?? undefined,
        email: author.email,
      })
    : "Member";
}

async function _readUpload({
  executor,
  viewer,
  event,
}: SourceOptions): Promise<EligibleDigestEvent | null> {
  const session = await executor
    .selectFrom("upload_sessions")
    .select("uploaded_by")
    .where("id", "=", event.source_id)
    .executeTakeFirst();
  if (!session || session.uploaded_by === viewer.memberId) {
    return null;
  }
  const query = executor
    .selectFrom("items")
    .select(["items.id", "items.captured_on"])
    .where("items.upload_session_id", "=", event.source_id);
  const items = await applyVisibilityFilter({ query, viewer })
    .orderBy("items.id")
    .execute();
  if (items.length === 0) {
    return null;
  }
  return {
    event,
    itemIds: items.map((item) => {
      return item.id;
    }),
    authorDisplayName: await _authorLabel(executor, session.uploaded_by),
    body: "",
    destination: `/?at=${items[0]!.captured_on}`,
  };
}

async function _readComment({
  executor,
  viewer,
  event,
}: SourceOptions): Promise<EligibleDigestEvent | null> {
  const comment = await executor
    .selectFrom("comments")
    .selectAll()
    .where("id", "=", event.source_id)
    .executeTakeFirst();
  if (!comment || comment.author_member_id === viewer.memberId) {
    return null;
  }
  if (event.category === "comment_tag") {
    const tag = await executor
      .selectFrom("comment_tags")
      .select("id")
      .where("comment_id", "=", event.source_id)
      .where("member_id", "=", viewer.memberId)
      .executeTakeFirst();
    if (!tag || !viewer.profileComplete) {
      return null;
    }
  }
  const query = executor
    .selectFrom("items")
    .select("items.id")
    .where("items.id", "=", comment.item_id);
  const item = await applyVisibilityFilter({
    query,
    viewer,
  }).executeTakeFirst();
  if (!item) {
    return null;
  }
  return {
    event,
    itemIds: [item.id],
    authorDisplayName: await _authorLabel(executor, comment.author_member_id),
    body: Array.from(comment.body).slice(0, 200).join(""),
    destination: `/items/${item.id}?comment=${event.source_id}`,
  };
}

/** Loads only surviving, currently visible source details without media URLs. */
export async function readDigestSource(
  options: SourceOptions,
): Promise<EligibleDigestEvent | null> {
  return options.event.category === "upload"
    ? _readUpload(options)
    : _readComment(options);
}
