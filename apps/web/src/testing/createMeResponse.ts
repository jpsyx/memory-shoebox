import type { MeResponse } from "@memory-shoebox/shared";

/**
 * A complete `MeResponse`, the shape `GET /api/me` and `PATCH /api/me` both
 * answer, for a test that needs a signed-in account rather than any
 * particular value in one.
 *
 * Only the fields that actually vary across call sites take an override;
 * everything else is a fixed, plausible default so a test that does not care
 * about a field never has to spell it out. Lives in `testing/` rather than
 * beside `MeResponse` itself, so a fixture never ends up imported by product
 * code.
 */
export function createMeResponse(
  overrides: Readonly<{
    memberId?: string;
    displayName?: string;
    storedDisplayName?: string | null;
    email?: string;
    role?: MeResponse["me"]["role"];
    joinedAt?: string;
  }> = {},
): MeResponse {
  const {
    memberId = "018f0000-0000-7000-8000-000000000000",
    displayName = "Papá",
    storedDisplayName = displayName,
    email = "papa@example.com",
    role = "admin",
    joinedAt = "2026-09-01T10:00:00.000Z",
  } = overrides;

  return {
    me: {
      member: { memberId, displayName },
      storedDisplayName,
      email,
      role,
      notify: {
        onUpload: true,
        onComment: true,
        onReply: true,
        onRemoval: true,
      },
      joinedAt,
      lastSignedInAt: "2026-09-28T10:00:00.000Z",
    },
    settings: {
      shoeboxName: "My Shoebox",
      pileArrangement: "messy",
      timezone: "Europe/Madrid",
    },
  };
}
