import {
  emailCommonSchema,
  removalReminderEmailPayloadSchema,
  removalRequestEmailPayloadSchema,
  removalResolvedEmailPayloadSchema,
  signInCodeEmailPayloadSchema,
  uploadSessionEmailPayloadSchema,
} from "../src/index.ts";
import { describe, expect, it } from "vitest";

describe("emailCommonSchema", () => {
  it("accepts a resolved common block", () => {
    const parsed = emailCommonSchema.safeParse({
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: "Abuela Rosa",
      preferencesUrl: "https://shoebox.example/account",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a relative base URL, because an email can only carry an absolute one", () => {
    const parsed = emailCommonSchema.safeParse({
      shoeboxName: "My Shoebox",
      baseUrl: "/account",
      timezone: "Europe/Madrid",
      toDisplayName: null,
      preferencesUrl: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a resolvable IANA zone and rejects one Intl cannot resolve", () => {
    const common = {
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      toDisplayName: null,
      preferencesUrl: null,
    };

    expect(
      emailCommonSchema.safeParse({ ...common, timezone: "Europe/Madrid" })
        .success,
    ).toBe(true);

    expect(
      emailCommonSchema.safeParse({ ...common, timezone: "Not/AZone" }).success,
    ).toBe(false);
  });

  it("rejects a whitespace Shoebox name, which renders as an empty masthead", () => {
    const parsed = emailCommonSchema.safeParse({
      shoeboxName: "   ",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: null,
      preferencesUrl: null,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("signInCodeEmailPayloadSchema", () => {
  // The schema no longer narrows `preferencesUrl` to `z.null()`. That rule is
  // `enqueueEmail`'s, because only it can decide the value, and
  // `apps/server/test/mail/enqueue.test.ts` asserts the null it writes for
  // this kind. What this file still owns is that the null parses.
  it("accepts the null preferencesUrl that this kind always carries", () => {
    expect(
      signInCodeEmailPayloadSchema.safeParse({
        shoeboxName: "My Shoebox",
        baseUrl: "https://shoebox.example",
        timezone: "Europe/Madrid",
        toDisplayName: null,
        preferencesUrl: null,
        code: "410233",
        expiresAt: "2026-09-27T10:10:00.000Z",
        expiresInMinutes: 10,
      }).success,
    ).toBe(true);
  });

  it("rejects a code that is not six digits", () => {
    const parsed = signInCodeEmailPayloadSchema.safeParse({
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: null,
      preferencesUrl: null,
      code: "41023",
      expiresAt: "2026-09-27T10:10:00.000Z",
      expiresInMinutes: 10,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("uploadSessionEmailPayloadSchema", () => {
  const PAYLOAD = {
    shoeboxName: "My Shoebox",
    baseUrl: "https://shoebox.example",
    timezone: "Europe/Madrid",
    toDisplayName: "Abuela Rosa",
    preferencesUrl: "https://shoebox.example/account",
    uploaderDisplayName: "Papá",
    visibleItemCount: 210,
    capturedOn: "2026-09-14",
    visibleDayCount: 1,
    firstCapturedOn: "2026-09-14",
    lastCapturedOn: "2026-09-14",
    dayUrl: "https://shoebox.example/?at=2026-09-14",
    milestoneName: "Mateo is born",
  };

  it("accepts one recipient's own figures", () => {
    expect(uploadSessionEmailPayloadSchema.safeParse(PAYLOAD).success).toBe(
      true,
    );
  });

  it("rejects a count of zero, because nobody is told about nothing", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleItemCount: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a formatted day, because the renderer formats it", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        capturedOn: "14 September 2026",
      }).success,
    ).toBe(false);
  });

  it("rejects a first day after the busiest day", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleDayCount: 3,
        firstCapturedOn: "2026-09-15",
        lastCapturedOn: "2026-09-16",
      }).success,
    ).toBe(false);
  });

  it("rejects a busiest day after the last day", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleDayCount: 3,
        firstCapturedOn: "2026-09-10",
        lastCapturedOn: "2026-09-13",
      }).success,
    ).toBe(false);
  });

  it("accepts a busiest day inside a span, and on either end of it", () => {
    ["2026-09-10", "2026-09-12", "2026-09-14"].forEach((capturedOn) => {
      expect(
        uploadSessionEmailPayloadSchema.safeParse({
          ...PAYLOAD,
          visibleDayCount: 3,
          capturedOn,
          firstCapturedOn: "2026-09-10",
          lastCapturedOn: "2026-09-14",
        }).success,
      ).toBe(true);
    });
  });

  it("rejects one day that spans two, because the days disagree", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleDayCount: 1,
        firstCapturedOn: "2026-09-13",
      }).success,
    ).toBe(false);
  });

  it("rejects several days that start and end on the same one", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleDayCount: 3,
      }).success,
    ).toBe(false);
  });

  it("rejects more days than photographs", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleItemCount: 2,
        visibleDayCount: 3,
        firstCapturedOn: "2026-09-12",
      }).success,
    ).toBe(false);
  });

  it("accepts exactly one photograph per day", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleItemCount: 3,
        visibleDayCount: 3,
        firstCapturedOn: "2026-09-12",
      }).success,
    ).toBe(true);
  });
});

describe("removal email payloads", () => {
  const common = {
    shoeboxName: "Family",
    baseUrl: "https://shoebox.example",
    timezone: "Europe/Madrid",
    toDisplayName: "Inés",
    preferencesUrl: null,
  };
  const requestPayload = {
    ...common,
    requesterDisplayName: "Inés",
    isRequesterTagged: true,
    reason: null,
    itemCapturedOn: "2026-09-14",
    itemUploadedOn: "2026-09-15",
    uploaderDisplayName: "Papá",
    requestsUrl: "https://shoebox.example/requests",
    relation: "uploader",
  };

  it("requires the request's date snapshots, tagging fact, and recipient relation", () => {
    const schema = removalRequestEmailPayloadSchema;
    expect(schema.safeParse(requestPayload).success).toBe(true);
    expect(
      schema.safeParse({ ...requestPayload, relation: "requester" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...requestPayload, itemUploadedOn: "2026-02-30" })
        .success,
    ).toBe(false);
    const { isRequesterTagged: _tagged, ...withoutTag } = requestPayload;
    expect(schema.safeParse(withoutTag).success).toBe(false);
  });

  it("requires a real reminder day and a positive integer week index", () => {
    const schema = removalReminderEmailPayloadSchema;
    const payload = {
      ...common,
      requesterDisplayName: "Inés",
      reason: null,
      requestedOn: "2026-09-14",
      weekIndex: 2,
      requestsUrl: "https://shoebox.example/requests",
      relation: "admin",
    };
    expect(schema.safeParse(payload).success).toBe(true);
    expect(
      schema.safeParse({ ...payload, requestedOn: "2026-02-30" }).success,
    ).toBe(false);
    [0, -1, 1.5].forEach((weekIndex) => {
      expect(schema.safeParse({ ...payload, weekIndex }).success).toBe(false);
    });
    expect(
      schema.safeParse({ ...payload, requestsUrl: "/requests" }).success,
    ).toBe(false);
  });

  it("parses all three outcomes and requires their distinct fields", () => {
    const schema = removalResolvedEmailPayloadSchema;
    const resolvedAt = "2026-09-21T12:00:00.000Z";
    const deleted = {
      ...common,
      outcome: "deleted",
      resolvedByDisplayName: "Papá",
      resolvedAt,
      itemCapturedOn: "2026-09-14",
      relation: "requester",
    };
    const declined = {
      ...common,
      outcome: "declined",
      declinerDisplayName: "Papá",
      declineReason: "The actual words.\nAnother line.",
      resolvedAt,
      itemUrl: "https://shoebox.example/item/1",
    };
    const withdrawn = {
      ...common,
      outcome: "withdrawn",
      withdrawnByDisplayName: "Inés",
      resolvedAt,
      itemCapturedOn: "2026-09-14",
      itemUrl: "https://shoebox.example/item/1",
    };
    [deleted, declined, withdrawn].forEach((payload) => {
      expect(schema.parse(payload)).toEqual(payload);
    });
    expect(schema.safeParse({ ...declined, declineReason: null }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...deleted, relation: "admin" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...withdrawn, itemUrl: undefined }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...deleted, outcome: "open" }).success).toBe(
      false,
    );
    expect(
      schema.parse({ ...deleted, itemUrl: "https://shoebox.example/item/1" }),
    ).not.toHaveProperty("itemUrl");
  });
});
