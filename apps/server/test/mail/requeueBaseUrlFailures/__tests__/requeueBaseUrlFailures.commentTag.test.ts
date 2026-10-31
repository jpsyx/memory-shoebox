import { expect, it } from "vitest";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertItem,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import { requeueBaseUrlFailures } from "../../../../src/mail/requeueBaseUrlFailures.ts";

it.each(["valid", "deleted", "invalid"] as const)(
  "recovers only valid comment-tag failures: %s",
  async (scenario) => {
    const fixture = await createTestApp();
    try {
      const author = await insertSignedInMember({ database: fixture.database });
      const memberId = await insertMember(fixture.database, {
        display_name: "Ana",
      });
      const itemId = await insertItem(fixture.database, {
        uploadedBy: author.memberId,
      });
      const created = await fixture.app.inject({
        method: "POST",
        url: `/api/items/${itemId}/comments`,
        headers: { cookie: author.cookie },
        payload: {
          body: "@Ana",
          commentTags: [{ memberId, start: 0, end: 4 }],
        },
      });
      expect(created.statusCode).toBe(201);
      const before = await fixture.database
        .selectFrom("outbound_emails")
        .selectAll()
        .executeTakeFirstOrThrow();
      expect(before.state).toBe("failed");
      const ledger = await fixture.database
        .selectFrom("comment_tag_notifications")
        .selectAll()
        .execute();
      expect(ledger).toHaveLength(1);
      if (scenario === "deleted") {
        await fixture.database.deleteFrom("comments").execute();
      }
      if (scenario === "invalid") {
        await fixture.database
          .updateTable("outbound_emails")
          .set({
            payload_json: JSON.stringify({
              ...JSON.parse(before.payload_json),
              itemKind: "unknown",
            }),
          })
          .execute();
      }
      const count = await requeueBaseUrlFailures({
        transaction: fixture.database,
        baseUrl: "https://repaired.example",
        now: NOW,
      });
      expect(count).toBe(scenario === "valid" ? 1 : 0);
      const after = await fixture.database
        .selectFrom("outbound_emails")
        .selectAll()
        .executeTakeFirstOrThrow();
      if (scenario === "valid") {
        expect(after.state).toBe("queued");
        expect(after.idempotency_key).toBe(before.idempotency_key);
        expect(JSON.parse(after.payload_json)).toMatchObject({
          itemUrl: `https://repaired.example/items/${itemId}?comment=${created.json().commentId}`,
          preferencesUrl: "https://repaired.example/account?email=comment-tag",
        });
        expect(
          await fixture.database
            .selectFrom("comment_tag_notifications")
            .selectAll()
            .execute(),
        ).toEqual(ledger);
      } else {
        expect(after.state).toBe("failed");
      }
    } finally {
      await fixture.close();
    }
  },
);
