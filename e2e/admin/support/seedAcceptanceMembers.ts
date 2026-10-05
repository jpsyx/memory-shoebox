import { insertSignedInMember } from "../../../apps/server/test/helpers/insertSignedInMember.ts";

import {
  insertMember,
  insertInvitation,
} from "../../../apps/server/test/helpers/seedHelpers/memberSeedHelpers.ts";

import type { AcceptanceContext } from "./acceptance.types.ts";

type AcceptanceMembers = {
  admin: Awaited<ReturnType<typeof insertSignedInMember>>;
  viewer: Awaited<ReturnType<typeof insertSignedInMember>>;
  secondAdmin: string;
  invited: string;
};

async function _seedInvitation({
  database,
  adminId,
}: Readonly<{
  database: AcceptanceContext["database"];
  adminId: string;
}>): Promise<string> {
  const now = new Date().toISOString();
  const invited = await insertMember(database, {
    id: "00000000-0000-4000-8000-000000000004",
    display_name: "Lucía",
    email: "lucia@example.com",
    status: "invited",
    joined_at: null,
    last_signed_in_at: null,
    last_seen_at: null,
  });
  await insertInvitation(database, {
    memberId: invited,
    invitedByMemberId: adminId,
    expires_at: new Date(Date.parse(now) + 7 * 86_400_000).toISOString(),
    last_sent_at: new Date(Date.parse(now) - 86_400_000).toISOString(),
  });

  return invited;
}

/** Create signed-in identities and the separate invited member. */
export async function seedAcceptanceMembers(
  database: AcceptanceContext["database"],
): Promise<AcceptanceMembers> {
  const admin = await insertSignedInMember({
    database,
    token: "step9-admin-browser-evidence",
    member: {
      id: "00000000-0000-4000-8000-000000000001",
      display_name: "Elena",
      email: "elena@example.com",
      role: "admin",
    },
    session: { device_label: "Chrome on Mac" },
  });
  const secondAdmin = await insertMember(database, {
    id: "00000000-0000-4000-8000-000000000002",
    display_name: "Mateo",
    email: "mateo@example.com",
    role: "admin",
  });
  const viewer = await insertSignedInMember({
    database,
    token: "acceptance-tagged-viewer",
    member: {
      id: "00000000-0000-4000-8000-000000000003",
      display_name: "Abuela Rosa",
      email: "rosa@example.com",
      role: "viewer",
    },
  });
  const invited = await _seedInvitation({
    database,
    adminId: admin.memberId,
  });
  return { admin, secondAdmin, viewer, invited };
}
