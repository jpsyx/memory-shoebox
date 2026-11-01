import { expect, it } from "vitest";
import { type KyselyPlugin } from "kysely";
import SQLite from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../../../src/db/client.ts";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertComment,
  insertItem,
  insertMember,
  insertVisibilityRule,
} from "../../helpers/seedHelpers/seedHelpers.ts";

it.each([
  ["rename", "POST"],
  ["visibility", "POST"],
  ["rename", "PATCH"],
  ["visibility", "PATCH"],
] as const)(
  "uses current %s on %s after the outer item read and holds the write lock for validation",
  async (change, method) => {
    const directory = mkdtempSync(join(tmpdir(), "comment-tag-race-"));
    const path = join(directory, "catalog.sqlite");
    const database = createDatabase(path);
    const concurrent = new SQLite(path, { timeout: 0 });
    let beforeTransaction: (() => void) | undefined;
    let inspectValidation: (() => void) | undefined;
    const plugin: KyselyPlugin = {
      transformQuery({ node }) {
        if (
          node.kind === "RawNode" &&
          node.sqlFragments.join("") === "begin immediate"
        ) {
          const action = beforeTransaction;
          beforeTransaction = undefined;
          action?.();
        }
        if (
          node.kind === "SelectQueryNode" &&
          JSON.stringify(node).includes('"name":"members"')
        ) {
          const action = inspectValidation;
          inspectValidation = undefined;
          action?.();
        }
        return node;
      },
      async transformResult({ result }) {
        return result;
      },
    };
    const fixture = await createTestApp({
      database: database.withPlugin(plugin),
    });
    try {
      const { cookie, memberId: authorId } = await insertSignedInMember({
        database,
      });
      const memberId = await insertMember(database, { display_name: "Ana" });
      const itemId = await insertItem(database, { uploadedBy: authorId });
      const ruleId = await insertVisibilityRule(database, { mode: "only" });
      const commentId = await insertComment(database, {
        itemId,
        authorMemberId: authorId,
        body: "Before edit",
      });
      let lockWasChecked = false;
      beforeTransaction = () => {
        if (change === "rename") {
          concurrent
            .prepare("update members set display_name = 'Anita' where id = ?")
            .run(memberId);
        } else {
          concurrent
            .prepare("update items set visibility_rule_id = ? where id = ?")
            .run(ruleId, itemId);
        }
        inspectValidation = () => {
          expect(() => {
            return concurrent
              .prepare("update members set display_name = 'Racer' where id = ?")
              .run(memberId);
          }).toThrow(/locked/);
          lockWasChecked = true;
        };
      };
      const response = await fixture.app.inject({
        method,
        url:
          method === "POST"
            ? `/api/items/${itemId}/comments`
            : `/api/comments/${commentId}`,
        headers: { cookie },
        payload: {
          body: "@Ana",
          commentTags: [{ memberId, start: 0, end: 4 }],
        },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe(
        change === "rename" ? "comment_tag_stale" : "comment_tag_unavailable",
      );
      expect(lockWasChecked).toBe(true);
      const comments = await database
        .selectFrom("comments")
        .selectAll()
        .execute();
      expect(comments).toHaveLength(1);
      expect(comments[0]?.body).toBe("Before edit");
      expect(
        await database.selectFrom("comment_tags").selectAll().execute(),
      ).toEqual([]);
    } finally {
      concurrent.close();
      await fixture.close();
      rmSync(directory, { recursive: true });
    }
  },
);
