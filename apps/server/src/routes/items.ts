import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createCommentRequestSchema,
  itemIdParamsSchema,
  itemsSeenRequestSchema,
  setCaptureDateRequestSchema,
  setItemPeopleRequestSchema,
  setItemTagsRequestSchema,
  setItemsVisibilityRequestSchema,
  setItemVisibilityRequestSchema,
  setReactionRequestSchema,
  updateItemRequestSchema,
  type CommentDto,
  type ItemDetail,
  type ReactionSummary,
  type SetItemsVisibilityResponse,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent.ts";
import { latchItemsSeen } from "../archive/latchItemsSeen.ts";
import { readMemberRefs } from "../archive/readMemberRefs.ts";
import { createId } from "../db/createId.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { enqueueCommentEmails } from "../items/enqueueCommentEmails.ts";
import {
  getVisibleItemOr404,
  type VisibleItem,
} from "../items/getVisibleItemOr404.ts";
import {
  assertMayChangeItemAccess,
  assertMayEditItemContent,
} from "../items/itemPermissions.ts";
import { latchItemOpened } from "../items/latchItemOpened.ts";
import { readItemDetail } from "../items/readItemDetail.ts";
import {
  EMPTY_REACTION_SUMMARY,
  makeReactionSummariesFromRows,
  readItemReactionRows,
} from "../items/readReactionSummaries.ts";
import { readItemSummariesByIds } from "../items/readItemSummariesByIds.ts";
import { setItemCaptureDate } from "../items/setItemCaptureDate.ts";
import { setItemPeople } from "../items/setItemPeople.ts";
import { setItemTags } from "../items/setItemTags.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { getLocalDayFromInstant } from "../time/localDayHelpers.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";

/**
 * Where in a video the comment stands, or a 400.
 *
 * Clamped at the top rather than rejected: `fraction * duration` with
 * `fraction === 1` produces exactly the duration, and a float a hair over it
 * is arithmetic rather than a bad request. Below zero is impossible from the
 * scrubber, and a pin on a photograph is a 400 because the photo viewer has
 * no transport to stand on.
 */
function _getAtSecondsForItem(options: {
  atSeconds: number | null | undefined;
  item: VisibleItem;
}): number | null {
  const { atSeconds } = options;
  if (atSeconds === null || atSeconds === undefined) {
    return null;
  }
  if (options.item.kind === "photo") {
    throw ApiError.invalidRequest({
      atSeconds: ["A photograph has no transport to pin a comment to."],
    });
  }
  return Math.min(atSeconds, (options.item.durationMs ?? 0) / 1000);
}

/**
 * The item slice's routes: `tech-specs/apis/items.md`.
 *
 * `GET /api/items/:itemId` is the permalink, and the latch that clears the
 * pile's accent dot lives here too, from step 4a.
 *
 * `GET /api/items/:itemId/original` is the download. `items.md`'s design
 * left "Download the original" open between widening the frozen `MediaRef`
 * with an `original` member and a dedicated route, and the route won: a
 * `MediaRef` addition would put a full-resolution signed URL on every print
 * in every timeline page for a button that appears on one surface, and only
 * a route can carry a sensible filename into the download.
 *
 * `POST /api/items/:itemId/comments` says something, optionally pinned to a
 * moment in a video. It is not role-gated: holding the payload is the
 * permission.
 *
 * **`204`, no body, and no per-id feedback of any kind** on the seen latch.
 * There is genuinely nothing to return, and a shape that reported anything
 * would be a visibility oracle: post one id, read the number back, learn
 * whether a photograph exists that you are not allowed to see.
 */
export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/items/:itemId",
    async (request: FastifyRequest): Promise<ItemDetail> => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const now = request.server.clock();

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });

      const detail = await readItemDetail({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        item,
        now,
      });

      // Both latches run after the reads are assembled and outside the read
      // work, so a page of reads never holds SQLite's single writer, and
      // `isUnseen` above reports the state the viewer arrived in.
      await latchItemOpened({
        database: request.server.database,
        memberId: viewer.memberId,
        itemId: item.itemId,
        now: now.toISOString(),
      });

      if (item.burstId !== null) {
        // `first_seen_at` for every visible sibling, in one batched
        // statement (`items.md` Ruling 6). A thumbnail in the strip has been
        // in front of the viewer; it was not opened at full size.
        await latchItemsSeen({
          database: request.server.database,
          viewer,
          itemIds: [],
          burstIds: [item.burstId],
          now: now.toISOString(),
        });
      }

      return detail;
    },
  );

  app.get(
    "/items/:itemId/original",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });

      const rendition = await request.server.database
        .selectFrom("item_renditions")
        .select("item_renditions.storage_key as storageKey")
        .where("item_renditions.item_id", "=", item.itemId)
        .where("item_renditions.purpose", "=", "original")
        .executeTakeFirst();

      if (rendition === undefined) {
        // An ingest defect rather than a permission fact, and the same 404
        // either way: the caller learns nothing about which it was.
        request.log.warn({ itemId }, "an item has no original to download");
        throw ApiError.notFound("item_not_found");
      }

      // A redirect rather than a payload field: widening `MediaRef` would put
      // a full-resolution signed URL on every print in every timeline page
      // for a button that appears on one surface, and a payload field cannot
      // get a sensible filename into the download.
      return reply
        .code(302)
        .header(
          "location",
          await request.server.b2.presignGet({
            key: rendition.storageKey,
            expiresInSeconds: appConfig.media.signedUrlTtlSeconds,
            downloadFilename: item.originalFilename ?? `${item.itemId}.jpg`,
          }),
        )
        .send();
    },
  );

  // The alt text override, and nothing else: widening this body is how the
  // rest of the contract gets bypassed (`itemEdits.ts`). Any uploader or
  // admin may describe anybody's photograph, which is the additive half of
  // `conventions.md` § Who may change an item.
  app.patch(
    "/items/:itemId",
    async (request: FastifyRequest): Promise<ItemDetail> => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const body = updateItemRequestSchema.parse(request.body);

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });
      assertMayEditItemContent({ viewer, code: "item_edit_forbidden" });

      // Trimmed by the schema; an empty result clears the override rather
      // than storing a blank description.
      const altText =
        body.altText === null || body.altText === "" ? null : body.altText;

      await request.server.database
        .updateTable("items")
        .set({ alt_text: altText })
        .where("id", "=", item.itemId)
        .execute();

      // The response recomposes `media.altText`, so clearing the override
      // immediately returns the generated string and the surface's own copy
      // stays true.
      return readItemDetail({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        item: { ...item, altTextOverride: altText },
        now: request.server.clock(),
      });
    },
  );

  // The final set, which is what the chip row expresses: add or remove chips
  // and press nothing. The write is a diff (`setItemTags`), never a delete
  // and reinsert, which would rewrite the provenance of tags nobody touched.
  app.put(
    "/items/:itemId/tags",
    async (request: FastifyRequest): Promise<ItemDetail> => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const body = setItemTagsRequestSchema.parse(request.body);
      const now = request.server.clock();

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });
      assertMayEditItemContent({ viewer, code: "item_edit_forbidden" });

      await runInImmediateTransaction({
        database: request.server.database,
        callback: async (transaction) => {
          await setItemTags({
            transaction,
            itemId: item.itemId,
            memberId: viewer.memberId,
            names: body.tags,
            now: now.toISOString(),
          });
        },
      });

      return readItemDetail({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        item,
        now,
      });
    },
  );

  // As for tags, with the response's `media.altText` recomposed in the same
  // round trip: the people just changed are half of what composes it, and a
  // people tag grants nothing the tagged person could not already see.
  app.put(
    "/items/:itemId/people",
    async (request: FastifyRequest): Promise<ItemDetail> => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const body = setItemPeopleRequestSchema.parse(request.body);
      const now = request.server.clock();

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });
      assertMayEditItemContent({ viewer, code: "item_edit_forbidden" });

      await runInImmediateTransaction({
        database: request.server.database,
        callback: async (transaction) => {
          await setItemPeople({
            transaction,
            itemId: item.itemId,
            memberId: viewer.memberId,
            people: body.people,
            now: now.toISOString(),
          });
        },
      });

      return readItemDetail({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        item,
        now,
      });
    },
  );

  // Repoints the item at a rule `POST /api/visibility-rules/resolve` already
  // found or created; this route never touches `visibility_rules` itself.
  // Both guards run: the role gate (`item_visibility_forbidden` for a
  // viewer), then ownership, since changing who can see something is the
  // access-changing action and belongs to the item's own uploader or an
  // admin (`items.md` Ruling 1), not to any uploader.
  app.patch(
    "/items/:itemId/visibility",
    async (request: FastifyRequest): Promise<ItemDetail> => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const body = setItemVisibilityRequestSchema.parse(request.body);
      const now = request.server.clock();

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });
      assertMayEditItemContent({ viewer, code: "item_visibility_forbidden" });
      assertMayChangeItemAccess({
        viewer,
        uploadedBy: item.uploadedBy,
        code: "item_visibility_forbidden",
      });

      const rule = await request.server.database
        .selectFrom("visibility_rules")
        .select("visibility_rules.id as ruleId")
        .where("visibility_rules.id", "=", body.visibilityRuleId)
        .executeTakeFirst();
      if (rule === undefined) {
        throw ApiError.invalidRequest({
          visibilityRuleId: ["That is not a rule in this Shoebox."],
        });
      }

      if (body.visibilityRuleId !== item.visibilityRuleId) {
        await runInImmediateTransaction({
          database: request.server.database,
          callback: async (transaction) => {
            // One column. The old rule is left exactly as it was, still
            // covering every other item pointing at it.
            await transaction
              .updateTable("items")
              .set({ visibility_rule_id: body.visibilityRuleId })
              .where("id", "=", item.itemId)
              .execute();

            // Visibility is one of the three things the state tables cannot
            // answer later, because only the current value survives.
            await writeActivityEvent({
              transaction,
              viewer,
              kind: "item_visibility_changed",
              subjectKind: "item",
              subjectId: item.itemId,
              subjectLabel: `A photograph from ${item.capturedOn}`,
              detail: {
                previousVisibilityRuleId: item.visibilityRuleId,
                visibilityRuleId: body.visibilityRuleId,
              },
              now: now.toISOString(),
            });
          },
        });
      }

      // The change is retroactive by construction: groups expand at read
      // time, so nothing is snapshotted and nothing needs recomputing. The
      // generation is deliberately not bumped: repointing an item changes no
      // rule's subjects and no member's role.
      return readItemDetail({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        item: { ...item, visibilityRuleId: body.visibilityRuleId },
        now,
      });
    },
  );

  // The one edit in the product that destroys a fact the file carried, which
  // is why it is the one edit with a table of its own. A `POST` to a noun
  // sub-resource, because REST cannot express "correct this".
  //
  // **No `activity_events` row.** `item_capture_date_changes` is the audit
  // trail for this edit, and the log records only what the state tables
  // cannot answer later.
  app.post(
    "/items/:itemId/capture-date",
    async (request: FastifyRequest): Promise<ItemDetail> => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const body = setCaptureDateRequestSchema.parse(request.body);
      const now = request.server.clock();

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });
      // Correcting a date is destructive, so it belongs to the item's own
      // uploader or an admin, and never to any uploader (`items.md` Ruling 1).
      assertMayChangeItemAccess({
        viewer,
        uploadedBy: item.uploadedBy,
        code: "item_capture_date_forbidden",
      });

      const settings = await readInstanceSettings({
        database: request.server.database,
        keys: ["shoebox.timezone"],
      });
      const timezone = settings["shoebox.timezone"];

      // Today in the Shoebox's own zone, never the server's: a photograph
      // taken this evening in Madrid is not in the future, and one dated
      // tomorrow is a typo rather than a fact. Both are `YYYY-MM-DD`, so the
      // string comparison is the date comparison.
      if (
        body.capturedOn >
        getLocalDayFromInstant({ instant: now.toISOString(), timezone })
      ) {
        throw ApiError.invalidRequest({
          capturedOn: ["A photograph cannot have been taken after today."],
        });
      }

      const change = await runInImmediateTransaction({
        database: request.server.database,
        callback: (transaction) => {
          return setItemCaptureDate({
            transaction,
            viewer,
            item,
            capturedOn: body.capturedOn,
            capturedTime: body.capturedTime ?? null,
            timezone,
            now: now.toISOString(),
          });
        },
      });

      // Recomposed over the changed item, so the response carries the new
      // `burst` (often null, because the item has just been ejected from one)
      // and the re-armed `milestones`.
      return readItemDetail({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        item: {
          ...item,
          capturedAt: change.capturedAt,
          capturedOn: change.capturedOn,
          captureSource: change.captureSource,
          burstId: change.burstId,
          burstIndex: change.burstIndex,
        },
        now,
      });
    },
  );

  // **Not role-gated.** Holding the payload is the permission: everybody who
  // can open an item can comment on it (`PRODUCT.md` § Visibility), a
  // `viewer` included. Only `getVisibleItemOr404` stands between a request
  // and a write.
  app.post(
    "/items/:itemId/comments",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<CommentDto> => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const body = createCommentRequestSchema.parse(request.body);
      const now = request.server.clock().toISOString();

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });
      const atSeconds = _getAtSecondsForItem({
        atSeconds: body.atSeconds,
        item,
      });

      const commentId = createId();
      await runInImmediateTransaction({
        database: request.server.database,
        callback: async (transaction) => {
          await transaction
            .insertInto("comments")
            .values({
              id: commentId,
              item_id: item.itemId,
              author_member_id: viewer.memberId,
              body: body.body,
              at_seconds: atSeconds,
              created_at: now,
              edited_at: null,
            })
            .execute();

          // Inside the same transaction: a message is never queued for a
          // comment that did not land, and the comment never lands without
          // its message.
          await enqueueCommentEmails({
            transaction,
            viewer,
            item,
            commentId,
            body: body.body,
            atSeconds,
            now,
          });
        },
      });

      void reply.code(201);
      return {
        commentId,
        author: (await readMemberRefs(request.server.database)).get(
          viewer.memberId,
        ) ?? { memberId: viewer.memberId, displayName: "" },
        body: body.body,
        atSeconds,
        createdAt: now,
        editedAt: null,
        canEdit: true,
        canDelete: true,
        reactions: EMPTY_REACTION_SUMMARY,
      };
    },
  );

  // One reaction per member per thing: the unique constraint is the whole of
  // the rule. Setting is one `INSERT ... ON CONFLICT DO UPDATE`; pressing the
  // one already left is a `DELETE`. Both answer `404`, never `403`, when the
  // item is invisible: reacting on an invisible item would leak it just as
  // surely as opening it.
  app.put(
    "/items/:itemId/reaction",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    async (request: FastifyRequest): Promise<ReactionSummary> => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const { kind } = setReactionRequestSchema.parse(request.body);
      const now = request.server.clock().toISOString();

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });

      await request.server.database
        .insertInto("item_reactions")
        .values({
          id: createId(),
          item_id: item.itemId,
          member_id: viewer.memberId,
          kind,
          created_at: now,
        })
        .onConflict((conflict) => {
          // `created_at` is deliberately not touched, so the moment somebody
          // first said something stands and the order inside a kind stays
          // stable when they change their mind.
          return conflict
            .columns(["item_id", "member_id"])
            .doUpdateSet({ kind });
        })
        .execute();

      return (
        makeReactionSummariesFromRows({
          rows: await readItemReactionRows({
            database: request.server.database,
            itemId: item.itemId,
          }),
          members: await readMemberRefs(request.server.database),
          viewerMemberId: viewer.memberId,
        }).get(item.itemId) ?? EMPTY_REACTION_SUMMARY
      );
    },
  );

  app.delete(
    "/items/:itemId/reaction",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });

      // Deleting a reaction that is not there is a 204, not a 404: the route
      // is idempotent and the outcome the caller asked for holds either way.
      // The 404 is about the item, never about the reaction.
      await request.server.database
        .deleteFrom("item_reactions")
        .where("item_id", "=", item.itemId)
        .where("member_id", "=", viewer.memberId)
        .execute();

      return reply.code(204).send();
    },
  );

  app.post(
    "/items/seen",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const viewer = requireViewer(request);
      const body = itemsSeenRequestSchema.parse(request.body);

      await latchItemsSeen({
        database: request.server.database,
        viewer,
        itemIds: body.itemIds,
        burstIds: body.burstIds,
        now: request.server.clock().toISOString(),
      });

      return reply.code(204).send();
    },
  );

  // A selection's save, all or nothing. Resolve every id under the viewer's
  // predicate first: one miss fails the whole request with the standard
  // `404` and no `details` naming which id failed, because a list of the
  // ids that survived is a count of what the viewer cannot see. The
  // per-item ownership check that follows is what "the check is per item"
  // means: a selection spanning two uploaders changes only the caller's own,
  // and an id the caller does not own fails the request with the `403`
  // rather than the response reporting how many it skipped, which is the
  // same oracle in a smaller form.
  app.post(
    "/items/visibility",
    async (request: FastifyRequest): Promise<SetItemsVisibilityResponse> => {
      const viewer = requireViewer(request);
      const body = setItemsVisibilityRequestSchema.parse(request.body);
      const now = request.server.clock();

      assertMayEditItemContent({ viewer, code: "item_visibility_forbidden" });

      const rows = await applyVisibilityFilter({
        viewer,
        query: request.server.database
          .selectFrom("items")
          .select([
            "items.id as itemId",
            "items.uploaded_by as uploadedBy",
            "items.visibility_rule_id as visibilityRuleId",
            "items.captured_on as capturedOn",
          ])
          .where("items.id", "in", [...body.itemIds]),
      }).execute();

      if (rows.length !== body.itemIds.length) {
        throw ApiError.notFound("item_not_found");
      }

      rows.forEach((row) => {
        assertMayChangeItemAccess({
          viewer,
          uploadedBy: row.uploadedBy,
          code: "item_visibility_forbidden",
        });
      });

      const rule = await request.server.database
        .selectFrom("visibility_rules")
        .select("visibility_rules.id as ruleId")
        .where("visibility_rules.id", "=", body.visibilityRuleId)
        .executeTakeFirst();
      if (rule === undefined) {
        throw ApiError.invalidRequest({
          visibilityRuleId: ["That is not a rule in this Shoebox."],
        });
      }

      const moved = rows.filter((row) => {
        return row.visibilityRuleId !== body.visibilityRuleId;
      });

      if (moved.length > 0) {
        await runInImmediateTransaction({
          database: request.server.database,
          callback: async (transaction) => {
            await transaction
              .updateTable("items")
              .set({ visibility_rule_id: body.visibilityRuleId })
              .where(
                "id",
                "in",
                moved.map((row) => {
                  return row.itemId;
                }),
              )
              .execute();

            // One row per item, never one for the batch: the log is read by
            // subject id, and a batch row answers no question anybody asks
            // of it.
            await Promise.all(
              moved.map((row) => {
                return writeActivityEvent({
                  transaction,
                  viewer,
                  kind: "item_visibility_changed",
                  subjectKind: "item",
                  subjectId: row.itemId,
                  subjectLabel: `A photograph from ${row.capturedOn}`,
                  detail: {
                    previousVisibilityRuleId: row.visibilityRuleId,
                    visibilityRuleId: body.visibilityRuleId,
                  },
                  now: now.toISOString(),
                });
              }),
            );
          },
        });
      }

      return {
        items: await readItemSummariesByIds({
          database: request.server.database,
          b2: request.server.b2,
          viewer,
          itemIds: body.itemIds,
          now,
          logger: request.log,
        }),
        // Structurally present and always null: the response set is bounded
        // by the request, so there is nothing to page.
        nextCursor: null,
      };
    },
  );
}
