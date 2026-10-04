import { createId } from "../../db/createId.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { getDisplayNameFromMember } from "../../members/getDisplayNameFromMember.ts";

type WriteActivityEventOptions = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  kind: ActivityEventKind;
  subjectKind:
    | "item"
    | "comment"
    | "milestone"
    | "member"
    | "session"
    | "group";
  subjectId: string;
  subjectLabel: string;
  detail?: Record<string, unknown>;
  /** Device being revoked; otherwise the actor device is snapshotted. */
  device?: { sessionId: string; label: string };
  now: string;
};

type ActivityActor = {
  storedDisplayName: string | null;
  email: string;
  sessionId: string | null;
  deviceLabel: string | null;
};

async function _getActorFromViewer(
  options: Readonly<Pick<WriteActivityEventOptions, "transaction" | "viewer">>,
): Promise<ActivityActor | undefined> {
  return options.transaction
    .selectFrom("members")
    .leftJoin("sessions", (join) => {
      return join
        .onRef("sessions.member_id", "=", "members.id")
        .on("sessions.id", "=", options.viewer.sessionId);
    })
    .select([
      "members.display_name as storedDisplayName",
      "members.email as email",
      "sessions.id as sessionId",
      "sessions.device_label as deviceLabel",
    ])
    .where("members.id", "=", options.viewer.memberId)
    .executeTakeFirst();
}

/**
 * The kinds this slice writes.
 *
 * A subset of the closed `CHECK` in migration 0007, which is the full list:
 * later steps widen this union as they start writing their own rows. The
 * audit log records only what the state tables cannot answer later, which is
 * deletions and any change to who may see what.
 */
export type ActivityEventKind =
  | "group_created"
  | "group_renamed"
  | "group_membership_changed"
  | "group_deleted"
  | "member_invited"
  | "member_role_changed"
  | "member_removed"
  | "invitation_revoked"
  | "device_revoked"
  | "milestone_deleted"
  | "item_deleted"
  | "comment_deleted"
  | "item_visibility_changed";

/**
 * Appends one row to the audit log.
 *
 * **Every label is denormalised**, because the log has to read correctly with
 * no join after the rows it describes are gone: an `item_deleted` row is the
 * only record anywhere that the photograph existed, and its `subject_id` is a
 * dangling id by design. The device label matters for the same reason and
 * looks optional: `device_id` is `SET NULL` to `sessions`, which fall out at
 * thirty days idle, so without it most of the log would read "device no
 * longer known".
 *
 * **The actor lookup is a `members` read with the session left-joined on,
 * not the other way around.** Joining from `sessions` and falling back to an
 * empty `actor_label` when that row is gone would leave `actor_label`, a
 * `NOT NULL` column, holding a value nobody can act on. A member is never
 * hard-deleted (`data-models.md` § `members`), so starting from `members` and
 * treating the session as optional context means the actor's name is always
 * available; only the device columns go null when the session has expired.
 *
 * Compose `subjectLabel` **before** the subject is destroyed, or it is empty
 * exactly where it is needed.
 *
 * @param options.transaction The caller's transaction.
 * @param options.viewer Who did it.
 * @param options.kind What happened.
 * @param options.subjectKind What it happened to.
 * @param options.subjectId The subject's id, dangling by design.
 * @param options.subjectLabel The subject as it stood, composed now.
 * @param options.device The target device snapshot for a revocation.
 * @param options.detail Anything the kind carries, JSON-encoded on the row.
 * @param options.now When it happened.
 */
export async function writeActivityEvent(
  options: Readonly<WriteActivityEventOptions>,
): Promise<void> {
  const actor = await _getActorFromViewer(options);

  await options.transaction
    .insertInto("activity_events")
    .values({
      id: createId(),
      kind: options.kind,
      occurred_at: options.now,
      actor_member_id: options.viewer.memberId,
      // `actor` is undefined only if the viewer's own member row is gone,
      // which never happens: a member is never hard-deleted. The empty
      // string is a last resort for a state the schema does not allow.
      actor_label:
        actor === undefined
          ? ""
          : getDisplayNameFromMember({
              storedDisplayName: actor.storedDisplayName ?? undefined,
              email: actor.email,
            }),
      subject_kind: options.subjectKind,
      subject_id: options.subjectId,
      subject_label: options.subjectLabel,
      device_id: options.device?.sessionId ?? actor?.sessionId ?? null,
      device_label: options.device?.label ?? actor?.deviceLabel ?? null,
      detail_json:
        options.detail === undefined ? null : JSON.stringify(options.detail),
    })
    .execute();
}
