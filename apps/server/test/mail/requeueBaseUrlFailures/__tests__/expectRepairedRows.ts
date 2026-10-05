import { expect } from "vitest";
import type { OutboundEmailsTable } from "../../../../src/db/types/operations.types.ts";
import { BASE_URL } from "./requeueBaseUrlFailuresTestHelpers.ts";

/** Checks repaired rows. */
export function expectRepairedRows(
  options: Readonly<{
    after: readonly OutboundEmailsTable[];
    before: readonly OutboundEmailsTable[];
  }>,
): void {
  const { after, before } = options;
  expect(after).toHaveLength(8);
  after.forEach((repaired) => {
    const original = before.find((row) => {
      return row.id === repaired.id;
    })!;
    expect(repaired.state).toBe("queued");
    expect(repaired.last_error_code).toBeNull();
    expect(repaired.subject).toBe(original.subject);
    expect(repaired.to_address).toBe(original.to_address);
    expect(repaired.to_member_id).toBe(original.to_member_id);
    expect(repaired.idempotency_key).toBe(original.idempotency_key);
    const originalPayload = JSON.parse(original.payload_json);
    const repairedPayload = JSON.parse(repaired.payload_json);
    expect(repairedPayload.baseUrl).toBe(BASE_URL);
    Object.entries(originalPayload).forEach(([key, value]) => {
      if (
        ![
          "baseUrl",
          "preferencesUrl",
          "joinUrl",
          "itemUrl",
          "dayUrl",
          "requestsUrl",
        ].includes(key)
      ) {
        expect(repairedPayload[key]).toEqual(value);
      }
    });
  });
}
