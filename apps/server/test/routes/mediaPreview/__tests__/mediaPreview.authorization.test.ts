import { describe, expect, it } from "vitest";

import { createId } from "../../../../src/db/createId.ts";

import {
  insertItem,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMediaPreviewContext,
  getMediaSideEffectsFromDatabase,
  installMediaPreviewTestLifecycle,
  seedMediaPreviewBurst,
  SELECTION,
} from "./mediaPreviewTestHelpers.ts";
installMediaPreviewTestLifecycle();
describe("side-effect-free media reads", () => {
  it("previews do not mark items or bursts opened", async () => {
    const context = await createMediaPreviewContext();
    const { before: itemId, frameIds } = await seedMediaPreviewBurst(context);
    await insertRendition(context.database, { itemId });
    const before = await getMediaSideEffectsFromDatabase(context.database);
    const preview = await context.post({
      path: "preview",
      payload: {
        itemIds: [itemId, ...frameIds],
        purpose: "speculative-preview",
      },
    });
    const neighbors = await context.post({
      path: "neighbors",
      payload: {
        itemId,
        selection: SELECTION,
        direction: "next",
      },
    });
    expect(preview.statusCode).toBe(200);
    expect(neighbors.statusCode).toBe(200);
    expect(preview.headers["cache-control"]).toBe("no-store");
    expect(neighbors.headers["cache-control"]).toBe("no-store");
    expect(preview.json().items).toHaveLength(5);
    expect(Object.keys(preview.json().items[0]).sort()).toEqual([
      "height",
      "itemId",
      "kind",
      "media",
      "width",
    ]);
    const after = await getMediaSideEffectsFromDatabase(context.database);
    expect(after).toEqual(before);
  });
});
describe("side-effect-free media reads", () => {
  it("omits hidden and missing IDs identically and deduplicates visible IDs", async () => {
    const context = await createMediaPreviewContext();
    const rule = await insertVisibilityRule(context.database, { mode: "only" });
    const hidden = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      visibility_rule_id: rule,
    });
    const visible = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 1,
    });
    const hiddenResponse = await context.post({
      path: "preview",
      payload: {
        itemIds: [hidden],
        purpose: "selected-view",
      },
    });
    const missingResponse = await context.post({
      path: "preview",
      payload: {
        itemIds: [createId()],
        purpose: "selected-view",
      },
    });
    expect(hiddenResponse.statusCode).toBe(200);
    expect(hiddenResponse.json()).toEqual(missingResponse.json());
    expect(
      (
        await context.post({
          path: "preview",
          payload: {
            itemIds: [visible, visible, hidden],
            purpose: "speculative-preview",
          },
        })
      )
        .json()
        .items.map((item: { itemId: string }) => {
          return item.itemId;
        }),
    ).toEqual([visible]);
    expect(
      (
        await context.post({
          path: "neighbors",
          payload: {
            itemId: hidden,
            selection: SELECTION,
            direction: "next",
          },
        })
      ).json(),
    ).toEqual({ ahead: [], behind: [] });
  });
});
describe("side-effect-free media reads", () => {
  it("rejects malformed IDs and nine-entry batches without catalog work", async () => {
    const context = await createMediaPreviewContext();
    const itemId = createId();
    let catalogQueries = 0;
    context.app.database = context.database.withPlugin({
      transformQuery: (args) => {
        catalogQueries += 1;
        return args.node;
      },
      transformResult: async (args) => {
        return args.result;
      },
    });
    for (const itemIds of [
      ["invalid"],
      Array.from({ length: 9 }, () => {
        return itemId;
      }),
      [],
    ]) {
      expect(
        (
          await context.post({
            path: "preview",
            payload: {
              itemIds,
              purpose: "speculative-preview",
            },
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await context.post({
          path: "neighbors",
          payload: {
            itemId: "invalid",
            direction: "next",
            selection: SELECTION,
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(context.b2.calls).toEqual([]);
    expect(catalogQueries).toBe(0);
  });
});
describe("side-effect-free media reads", () => {
  it("allows selected original-video renewal without speculative original playback or opens", async () => {
    const context = await createMediaPreviewContext();
    const itemId = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      kind: "video",
    });
    await insertRendition(context.database, {
      itemId,
      purpose: "original",
      content_type: "video/quicktime",
      byte_size: 90_000_000,
    });
    const precedingPhoto = await insertItem(context.database, {
      uploadedBy: context.uploaderId,
      seq: 1,
      captured_at: "2026-09-27T23:00:00.000Z",
    });
    const before = await getMediaSideEffectsFromDatabase(context.database);
    const neighbors = await context.post({
      path: "neighbors",
      payload: {
        itemId: precedingPhoto,
        selection: SELECTION,
        direction: "next",
      },
    });
    expect(neighbors.json().ahead[0]).toMatchObject({
      itemId,
      media: { playback: null },
    });
    const speculative = await context.post({
      path: "preview",
      payload: {
        itemIds: [itemId],
        purpose: "speculative-preview",
      },
    });
    expect(speculative.statusCode).toBe(200);
    expect(speculative.json().items[0].media.playback).toBeNull();
    const selected = await context.post({
      path: "preview",
      payload: {
        itemIds: [itemId],
        purpose: "selected-view",
      },
    });
    expect(selected.json().items[0].media.playback).toMatchObject({
      purpose: "original",
      contentType: "video/quicktime",
    });
    context.app.clock = () => {
      return new Date(new Date(NOW).getTime() + 3_540_000);
    };
    const renewed = await context.post({
      path: "preview",
      payload: {
        itemIds: [itemId],
        purpose: "selected-view",
      },
    });
    expect(renewed.json().items[0].media.playback.issuedAt).not.toBe(
      selected.json().items[0].media.playback.issuedAt,
    );
    expect(renewed.json().items[0].media.playback.expiresAt).not.toBe(
      selected.json().items[0].media.playback.expiresAt,
    );
    expect(await getMediaSideEffectsFromDatabase(context.database)).toEqual(
      before,
    );
  });
});
describe("side-effect-free media reads", () => {
  it("requires a session and shares the authenticated rate limit", async () => {
    const context = await createMediaPreviewContext();
    const payload = { itemIds: [createId()], purpose: "speculative-preview" };
    expect(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/media/preview",
          payload,
        })
      ).statusCode,
    ).toBe(401);
    const responses = await Promise.all(
      Array.from({ length: 601 }, () => {
        return context.post({ path: "preview", payload: payload });
      }),
    );
    expect(
      responses.filter((response) => {
        return response.statusCode === 429;
      }),
    ).toHaveLength(1);
    expect(
      (
        await context.post({
          path: "neighbors",
          payload: {
            itemId: payload.itemIds[0],
            selection: SELECTION,
            direction: "next",
          },
        })
      ).statusCode,
    ).toBe(429);
  });
});
