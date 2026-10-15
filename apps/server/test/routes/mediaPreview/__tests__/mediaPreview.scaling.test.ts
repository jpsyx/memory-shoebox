import { describe, expect, it } from "vitest";

import { CompiledQuery } from "kysely";

import { readMediaNeighbors } from "../../../../src/media/readMediaNeighbors.ts";

import { EVERYONE_VISIBILITY_RULE_ID } from "../../../../src/visibility/everyoneRule.ts";

import { insertItem, NOW } from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  createMediaPreviewContext,
  installMediaPreviewTestLifecycle,
  seedMediaPreviewBurst,
  SELECTION,
} from "./mediaPreviewTestHelpers.ts";
installMediaPreviewTestLifecycle();
describe("side-effect-free media reads", () => {
  it("keeps statement and returned-row counts bounded as the archive and burst grow", async () => {
    const context = await createMediaPreviewContext();
    const { after, burstId } = await seedMediaPreviewBurst(context);
    const queries: CompiledQuery[] = [];
    const rowCounts: number[] = [];
    const compiled = new WeakMap<object, CompiledQuery>();
    const database = context.database.withPlugin({
      transformQuery: (args) => {
        compiled.set(
          args.queryId,
          context.database.getExecutor().compileQuery(args.node, args.queryId),
        );
        return args.node;
      },
      transformResult: async (args) => {
        queries.push(compiled.get(args.queryId)!);
        rowCounts.push(args.result.rows.length);
        return args.result;
      },
    });
    const read = () => {
      return readMediaNeighbors({
        database,
        b2: context.b2,
        now: new Date(NOW),
        viewer: {
          memberId: context.memberId,
          sessionId: context.sessionId,
          role: "viewer",
          isAdmin: false,
          visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
        },
        request: { itemId: after, direction: "previous", selection: SELECTION },
      });
    };
    await read();
    const smallCount = queries.length;
    const smallRows = [...rowCounts];
    await Promise.all(
      Array.from({ length: 1000 }, (_, index) => {
        return insertItem(context.database, {
          uploadedBy: context.uploaderId,
          seq: index + 100,
          burst_id: index < 500 ? burstId : null,
          burst_index: index < 500 ? index + 100 : null,
          captured_at: "2026-09-27T12:30:00.000Z",
          captured_on: index < 500 ? "2026-09-27" : "2026-09-29",
        });
      }),
    );
    queries.length = 0;
    rowCounts.length = 0;
    const result = await read();
    expect(result.ahead).toHaveLength(2);
    expect(result.behind).toHaveLength(0);
    expect(queries.length).toBe(smallCount);
    expect(queries.length).toBeLessThanOrEqual(16);
    expect(Math.max(...smallRows, ...rowCounts)).toBeLessThanOrEqual(3);
    const plans = await Promise.all(
      queries.map((query) => {
        return context.database.executeQuery<{ detail: string }>(
          CompiledQuery.raw(`EXPLAIN QUERY PLAN ${query.sql}`, [
            ...query.parameters,
          ]),
        );
      }),
    );
    const details = plans.flatMap((plan) => {
      return plan.rows.map((row) => {
        return row.detail;
      });
    });
    [
      "items_navigation_capture",
      "items_navigation_burst_capture",
      "items_navigation_burst_frame",
    ].forEach((index) => {
      expect(
        details.some((detail) => {
          return detail.includes(`USING INDEX ${index} `);
        }),
      ).toBe(true);
    });
    expect(
      details.filter((detail) => {
        return detail.includes("TEMP B-TREE");
      }),
    ).toEqual([]);
  });
});
