import { insertRemovalRequest } from "../../../apps/server/test/helpers/seedHelpers/miscSeedHelpers.ts";

import {
  insertPerson,
  insertItemPerson,
  insertMilestone,
  insertItemMilestone,
} from "../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";

import type { AcceptanceContext } from "./acceptanceTypes.ts";
/** Seed actual tagged identity, open request and milestone association. */
export async function seedAcceptanceItemContext(
  database: AcceptanceContext["database"],
  adminId: string,
  rosa: string,
): Promise<string> {
  const person = await insertPerson(database, {
    displayName: "Abuela Rosa",
    member_id: rosa,
  });
  await insertItemPerson(database, {
    itemId: "00000000-0000-4000-8000-000000000012",
    personId: person,
  });
  await insertRemovalRequest(database, {
    item_id: "00000000-0000-4000-8000-000000000012",
    requestedByMemberId: rosa,
    itemUploaderMemberId: adminId,
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
    reason: "Please take this one down.",
  });
  const milestone = await insertMilestone(database, {
    name: "The first week",
    startsOn: "2026-09-27",
    endsOn: "2026-09-27",
    created_by: adminId,
  });
  await insertItemMilestone(database, {
    itemId: "00000000-0000-4000-8000-000000000012",
    milestoneId: milestone,
  });
  return person;
}
