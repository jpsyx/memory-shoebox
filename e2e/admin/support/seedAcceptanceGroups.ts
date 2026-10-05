import { insertSession } from "../../../apps/server/test/helpers/seedHelpers/memberSeedHelpers.ts";
import { insertInstanceSetting } from "../../../apps/server/test/helpers/seedHelpers/miscSeedHelpers.ts";

import {
  insertGroup,
  insertGroupMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../apps/server/test/helpers/seedHelpers/visibilitySeedHelpers.ts";

import type { AcceptanceContext } from "./acceptanceTypes.ts";
/** Seed instance settings and both directions of group visibility. */
export async function seedAcceptanceGroups(
  database: AcceptanceContext["database"],
  rosa: string,
  invited: string,
): Promise<{ group: string; only: string; except: string }> {
  await insertSession(database, {
    memberId: rosa,
    device_label: "Safari on iPhone",
  });
  await insertInstanceSetting(database, {
    key: "shoebox.name",
    value: "The Ruiz Shoebox",
  });
  await insertInstanceSetting(database, {
    key: "shoebox.timezone",
    value: "Europe/Madrid",
  });
  const group = await insertGroup(database, {
    id: "00000000-0000-4000-8000-000000000005",
    name: "Cousins",
  });
  await insertGroupMember(database, { groupId: group, memberId: rosa });
  await insertGroupMember(database, { groupId: group, memberId: invited });
  const only = await insertVisibilityRule(database, { mode: "only" });
  const except = await insertVisibilityRule(database, { mode: "except" });
  await insertVisibilityRuleSubject(database, {
    ruleId: only,
    groupId: group,
  });
  await insertVisibilityRuleSubject(database, {
    ruleId: except,
    groupId: group,
  });
  return { group, only, except };
}
