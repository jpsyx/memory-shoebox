import type { TimelineResponse } from "@memory-shoebox/shared";

import { describe, expect, it } from "vitest";

import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";

import {
  insertBurst,
  insertItem,
  insertMember,
  insertRendition,
  insertUploadSession,
  insertVisibilityRule,
  setBurstCover,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

import {
  insertDrawableItem,
  makeApp,
} from "../../__tests__/timelineContractTestHelpers.ts";

describe("bidirectional atomic-day timeline pages", () => {
  it("keeps hidden burst frames absent when reversing into their atomic day", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      const uploader = await insertMember(fixture.database);
      const hiddenRule = await insertVisibilityRule(fixture.database, {
        mode: "only",
      });
      const uploadSessionId = await insertUploadSession(fixture.database, {
        uploadedBy: uploader,
      });
      const burstId = await insertBurst(fixture.database, {
        uploadSessionId,
        capturedOn: "2026-09-20",
      });
      const frameIds = [];
      for (let index = 0; index < 3; index += 1) {
        const itemId = await insertItem(fixture.database, {
          uploadedBy: uploader,
          seq: index + 1,
          captured_on: "2026-09-20",
          captured_at: `2026-09-20T09:0${index}:00Z`,
          burst_id: burstId,
          burst_index: index + 1,
          ...(index === 2 ? { visibility_rule_id: hiddenRule } : {}),
        });
        await insertRendition(fixture.database, { itemId, purpose: "thumb" });
        frameIds.push(itemId);
      }
      await setBurstCover(fixture.database, {
        burstId,
        coverItemId: frameIds[2]!,
      });
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 10,
        capturedOn: "2026-09-21",
      });
      await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 11,
        capturedOn: "2026-09-19",
      });
      const read = async (cursor: string | null): Promise<TimelineResponse> => {
        return (
          await fixture.app.inject({
            method: "GET",
            headers: { cookie },
            url: `/api/timeline?limit=1${cursor === null ? "" : `&cursor=${cursor}`}`,
          })
        ).json();
      };
      const newest = await read(null);
      const middle = await read(newest.nextCursor);
      const oldest = await read(middle.nextCursor);
      const restored = await read(oldest.previousCursor);
      expect(restored.days).toEqual(middle.days);
      expect(restored.days[0]!.itemCount).toBe(2);
      expect(restored.days[0]!.items[0]!.burst).toMatchObject({
        visibleFrameCount: 2,
        coverItemId: frameIds[0],
      });
      expect(JSON.stringify(restored)).not.toContain(frameIds[2]);
    } finally {
      await fixture.close();
    }
  });
});
describe("bidirectional atomic-day timeline pages", () => {
  it("never issues cursors toward hidden days and treats deleted boundary sources as dates", async () => {
    const fixture = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({
      database: fixture.database,
    });
    try {
      const otherMember = await insertMember(fixture.database);
      const hiddenRule = await insertVisibilityRule(fixture.database, {
        mode: "only",
      });
      for (const [index, capturedOn] of [
        "2026-09-25",
        "2026-09-15",
      ].entries()) {
        await insertDrawableItem(fixture.database, {
          uploadedBy: otherMember,
          seq: index + 10,
          capturedOn,
          visibilityRuleId: hiddenRule,
        });
      }
      const source = await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 1,
        capturedOn: "2026-09-23",
      });
      const equalDay = await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 2,
        capturedOn: "2026-09-23",
      });
      const boundarySource = await insertDrawableItem(fixture.database, {
        uploadedBy: memberId,
        seq: 3,
        capturedOn: "2026-09-21",
      });
      const first = (
        await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: "/api/timeline?limit=1",
        })
      ).json<TimelineResponse>();
      expect(first.previousCursor).toBeNull();
      expect(
        first.days[0]!.items.map((item) => {
          return item.itemId;
        }),
      ).toEqual([source, equalDay]);
      const last = (
        await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=1&cursor=${first.nextCursor}`,
        })
      ).json<TimelineResponse>();
      expect(last.nextCursor).toBeNull();
      await fixture.database
        .deleteFrom("items")
        .where("id", "=", boundarySource)
        .execute();
      const restored = (
        await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=1&cursor=${last.previousCursor}`,
        })
      ).json<TimelineResponse>();
      expect(restored.days).toEqual(first.days);
      await fixture.database
        .deleteFrom("items")
        .where("id", "in", [source, equalDay])
        .execute();
      const reverse = (
        await fixture.app.inject({
          method: "GET",
          headers: { cookie },
          url: `/api/timeline?limit=1&cursor=${last.previousCursor}`,
        })
      ).json<TimelineResponse>();
      expect(reverse).toEqual({
        days: [],
        nextCursor: null,
        previousCursor: null,
        resultCount: null,
      });
    } finally {
      await fixture.close();
    }
  });
});
