import { expect, it } from "vitest";
import { getDigestWindowFromInstant } from "../../src/mail/digests/getDigestWindowFromInstant.ts";

it.each([
  ["2026-03-08T12:59:00.000Z", "America/New_York", null],
  ["2026-03-08T13:00:00.000Z", "America/New_York", "2026-03-08"],
  ["2026-11-01T13:59:00.000Z", "America/New_York", null],
  ["2026-11-01T14:00:00.000Z", "America/New_York", "2026-11-01"],
  ["2026-11-03T03:15:00.000Z", "Asia/Kathmandu", "2026-11-03"],
  ["2026-09-06T12:00:00.000Z", "America/Santiago", "2026-09-06"],
])(
  "uses the local nine o'clock gate at %s in %s",
  (now, timezone, expected) => {
    expect(
      getDigestWindowFromInstant({ now: now!, timezone: timezone! })
        ?.sendDate ?? null,
    ).toBe(expected);
  },
);
