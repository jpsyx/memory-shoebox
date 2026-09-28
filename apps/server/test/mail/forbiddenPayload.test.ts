import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/ids.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { enqueueEmail } from "../../src/mail/enqueue.ts";
import { findForbiddenPayloadValues } from "../helpers/forbiddenPayloadValues.ts";
import { NOW, insertInstanceSetting, shiftMinutes } from "../helpers/seed.ts";

describe("findForbiddenPayloadValues", () => {
  it("catches a raw storage key, an address and a formatted date", () => {
    const found = findForbiddenPayloadValues({
      storageKey: "media/2026/09/IMG_0001.jpg",
      signedInFrom: "203.0.113.7",
      whenItHappened: "14 September 2026",
      lastSeen: "3 days ago",
    });

    expect(
      found
        .map((entry) => {
          return entry.reason;
        })
        .sort(),
    ).toEqual([
      "formatted_date",
      "formatted_date",
      "ip_address",
      "storage_key",
    ]);
  });

  it("leaves a signed URL and an ISO instant alone", () => {
    expect(
      findForbiddenPayloadValues({
        itemUrl: "https://shoebox.example/item/abc",
        capturedOn: "2026-09-14",
        createdAt: "2026-09-27T10:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("leaves a person's own words alone, because they are the message", () => {
    expect(
      findForbiddenPayloadValues({ body: "See you on 14 September!" }),
    ).toEqual([]);
  });
});

describe("what the scanner sees through", () => {
  it("walks arrays and nested objects, and names the path it found", () => {
    expect(
      findForbiddenPayloadValues({
        renditions: [{ url: "https://shoebox.example/a" }, { key: "a/b.jpg" }],
      }),
    ).toEqual([
      { path: "renditions[1].key", value: "a/b.jpg", reason: "storage_key" },
    ]);
  });

  it("exempts a person's own words inside an array and under a nest", () => {
    expect(
      findForbiddenPayloadValues({
        body: ["See you on 14 September", "203.0.113.7"],
        comment: { body: "14 September, at the grandparents'" },
      }),
    ).toEqual([]);
  });

  it("catches a key with a query string after it, and IPv6 compressed", () => {
    expect(
      findForbiddenPayloadValues({
        key: "uploads/s1/f1/original.jpg?X-Amz-Expires=900",
        seenFrom: "2001:db8::1",
        alsoSeenFrom: "::1",
      }).map((entry) => {
        return entry.reason;
      }),
    ).toEqual(["storage_key", "ip_address", "ip_address"]);
  });

  it("catches a numeric date and a relative phrase in either direction", () => {
    expect(
      findForbiddenPayloadValues({
        a: "14/09/2026",
        b: "in 3 days",
        c: "September 14, 2026",
        d: "last Sunday",
        e: "2026/09/14",
      }).map((entry) => {
        return entry.reason;
      }),
    ).toEqual([
      "formatted_date",
      "formatted_date",
      "formatted_date",
      "formatted_date",
      "formatted_date",
    ]);
  });

  it("reports a MAC address, which is a device identifier all the same", () => {
    expect(findForbiddenPayloadValues({ seenOn: "00:1a:2b:3c:4d:5e" })).toEqual(
      [
        {
          path: "seenOn",
          value: "00:1a:2b:3c:4d:5e",
          reason: "ip_address",
        },
      ],
    );
  });
});

describe("what the scanner leaves alone, so that it stays trusted", () => {
  it("does not cry wolf on a name, a Shoebox or a milestone", () => {
    expect(
      findForbiddenPayloadValues({
        toDisplayName: "May Chen",
        shoeboxName: "Sunday",
        milestone: "August at the grandparents'",
        timezone: "America/New_York",
        filename: "IMG_0001.jpg",
      }),
    ).toEqual([]);
  });

  it("does not report the empty baseUrl that a failed enqueue writes", () => {
    expect(findForbiddenPayloadValues({ baseUrl: "" })).toEqual([]);
  });
});

describe("what enqueueEmail actually writes", () => {
  it("writes no storage key, no address and no formatted date", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    const codeId = createId();
    await enqueueEmail({
      executor: database,
      now: NOW,
      input: {
        kind: "sign_in_code",
        toAddress: "rosa@example.com",
        toMemberId: null,
        toDisplayName: "Abuela Rosa",
        idempotencyKey: `signin:${codeId}`,
        payload: {
          code: "410233",
          expiresAt: shiftMinutes(NOW, 10),
          expiresInMinutes: 10,
        },
        triggerKind: "sign_in_code",
        triggerId: codeId,
      },
    });

    const row = await database
      .selectFrom("outbound_emails")
      .select("payload_json")
      .executeTakeFirstOrThrow();

    expect(findForbiddenPayloadValues(JSON.parse(row.payload_json))).toEqual(
      [],
    );
    await database.destroy();
  });

  it("writes nothing forbidden when public.base_url is unset either", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const codeId = createId();
    await enqueueEmail({
      executor: database,
      now: NOW,
      input: {
        kind: "sign_in_code",
        toAddress: "rosa@example.com",
        toMemberId: null,
        toDisplayName: "Abuela Rosa",
        idempotencyKey: `signin:${codeId}`,
        payload: {
          code: "410233",
          expiresAt: shiftMinutes(NOW, 10),
          expiresInMinutes: 10,
        },
        triggerKind: "sign_in_code",
        triggerId: codeId,
      },
    });

    const row = await database
      .selectFrom("outbound_emails")
      .select("payload_json")
      .executeTakeFirstOrThrow();

    expect(findForbiddenPayloadValues(JSON.parse(row.payload_json))).toEqual(
      [],
    );
    await database.destroy();
  });
});
