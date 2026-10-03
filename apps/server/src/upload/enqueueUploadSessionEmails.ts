import type { MemberRole } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { enqueueEmail } from "../mail/enqueueEmail.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import { getMemberRoleFromStoredValue } from "../members/getMemberRoleFromStoredValue.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";

/** How many of the batch's items one rule covers on one day. */
type RuleDayCount = {
  ruleId: string;
  capturedOn: string;
  itemCount: number;
};

/** One member who may hear about the batch, before the intersection. */
type Candidate = {
  memberId: string;
  email: string;
  displayName: string;
  role: MemberRole;
};

/** One recipient's own figures, which is all that differs between copies. */
type RecipientFigures = {
  visibleItemCount: number;
  capturedOn: string;
  visibleDayCount: number;
  firstCapturedOn: string;
  lastCapturedOn: string;
};

/** A candidate who can see at least one item, with what they can see. */
type Recipient = {
  candidate: Candidate;
  figures: RecipientFigures;
};

/** What every copy of the message shares. */
type UploadEmailContext = {
  sessionId: string;
  uploaderDisplayName: string;
  baseUrl: string;
  milestoneNamesByDay: ReadonlyMap<string, string>;
  now: string;
};

/** What `enqueueUploadSessionEmails` is given. */
type EnqueueUploadSessionEmailsOptions = {
  transaction: DatabaseExecutor;
  sessionId: string;
  uploadedBy: string;
  now: string;
};

/**
 * Query 1 of `notifications.md` § Recipient resolution: the batch's rules
 * and their counts, grouped by day as well, because each recipient's
 * `capturedOn` and day count fall out of the same rows. |R| x days rows, and
 * |R| = 1 in the normal case.
 */
async function _readRuleDayCounts(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
}): Promise<RuleDayCount[]> {
  const rows = await options.transaction
    .selectFrom("items")
    .select((eb) => {
      return [
        "items.visibility_rule_id as ruleId",
        "items.captured_on as capturedOn",
        eb.fn.countAll<number>().as("itemCount"),
      ];
    })
    .where("items.upload_session_id", "=", options.sessionId)
    .groupBy(["items.visibility_rule_id", "items.captured_on"])
    .execute();

  return rows.map((row) => {
    return { ...row, itemCount: Number(row.itemCount) };
  });
}

/**
 * Query 2: every active member who wants upload mail, minus the uploader.
 *
 * The actor is excluded by id here, before the intersection, and so is
 * anybody with `notify_on_upload = 0`. An invited member who has not signed
 * in yet is not `active`, and their invitation is already doing this job.
 */
async function _readCandidates(options: {
  transaction: DatabaseExecutor;
  uploadedBy: string;
}): Promise<Candidate[]> {
  const rows = await options.transaction
    .selectFrom("members")
    .select([
      "members.id as memberId",
      "members.email as email",
      "members.display_name as storedDisplayName",
      "members.role as role",
    ])
    .where("members.status", "=", "active")
    .where("members.notify_on_upload", "=", 1)
    .where("members.id", "!=", options.uploadedBy)
    .execute();

  return rows.map((row) => {
    return {
      memberId: row.memberId,
      email: row.email,
      displayName: getDisplayNameFromMember({
        storedDisplayName: row.storedDisplayName ?? undefined,
        email: row.email,
      }),
      role: getMemberRoleFromStoredValue(row.role),
    };
  });
}

/** `(memberId, ruleId)` pairs, as each member's set of rule ids. */
function _groupRuleIdsByMemberId(
  rows: ReadonlyArray<{ memberId: string; ruleId: string }>,
): Map<string, Set<string>> {
  return rows.reduce((byMemberId, row) => {
    const ruleIds = byMemberId.get(row.memberId) ?? new Set<string>();
    ruleIds.add(row.ruleId);
    return byMemberId.set(row.memberId, ruleIds);
  }, new Map<string, Set<string>>());
}

/**
 * Query 3: which of the batch's rules each candidate sees through, for every
 * candidate at once.
 *
 * The predicate is `getVisibleRuleIdsFromMemberId.ts`'s, correlated on the
 * member instead of bound to one, and restricted to the batch's rules, so
 * the intersection of R with V(member) is computed in the query rather than
 * after it. One query for nine members, never nine. `item_people` is not
 * consulted: being in a photograph is not a key to it (Decision 7).
 */
async function _readVisibleRuleIdsByMemberId(options: {
  transaction: DatabaseExecutor;
  memberIds: readonly string[];
  ruleIds: readonly string[];
}): Promise<Map<string, Set<string>>> {
  if (options.memberIds.length === 0 || options.ruleIds.length === 0) {
    return new Map();
  }
  const rows = await options.transaction
    .selectFrom(["members as member", "visibility_rules as rule"])
    .select(["member.id as memberId", "rule.id as ruleId"])
    .where("member.id", "in", [...options.memberIds])
    .where("rule.id", "in", [...options.ruleIds])
    .where((eb) => {
      const namesMember = eb.exists(
        eb
          .selectFrom("visibility_rule_subjects as subject")
          .select("subject.id")
          .whereRef("subject.rule_id", "=", "rule.id")
          .where((subjectEb) => {
            return subjectEb.or([
              subjectEb("subject.member_id", "=", subjectEb.ref("member.id")),
              subjectEb(
                "subject.group_id",
                "in",
                subjectEb
                  .selectFrom("group_members")
                  .select("group_members.group_id")
                  .whereRef("group_members.member_id", "=", "member.id"),
              ),
            ]);
          }),
      );
      return eb.or([
        eb("rule.mode", "=", "everyone"),
        eb.and([eb("rule.mode", "=", "only"), namesMember]),
        eb.and([eb("rule.mode", "=", "except"), eb.not(namesMember)]),
      ]);
    })
    .execute();

  return _groupRuleIdsByMemberId(rows);
}

/**
 * One recipient's figures from the rules they see through, or undefined
 * when they see none of the batch.
 *
 * `capturedOn` is the day carrying most of their visible items, and the
 * earliest of equally busy days wins (step 6a design, decision 5): the days
 * are walked in calendar order and a later day must be strictly busier to
 * take over.
 */
function _makeFiguresFromRuleDayCounts(options: {
  ruleDayCounts: readonly RuleDayCount[];
  visibleRuleIds: ReadonlySet<string>;
}): RecipientFigures | undefined {
  const countsByDay = options.ruleDayCounts
    .filter((row) => {
      return options.visibleRuleIds.has(row.ruleId);
    })
    .reduce((byDay, row) => {
      const dayCount = (byDay.get(row.capturedOn) ?? 0) + row.itemCount;
      return byDay.set(row.capturedOn, dayCount);
    }, new Map<string, number>());

  const days = [...countsByDay.keys()].sort();
  const firstDay = days[0];
  const lastDay = days.at(-1);
  if (firstDay === undefined || lastDay === undefined) {
    return undefined;
  }

  const busiestDay = days.reduce((busiest, day) => {
    return (countsByDay.get(day) ?? 0) > (countsByDay.get(busiest) ?? 0)
      ? day
      : busiest;
  }, firstDay);

  return {
    visibleItemCount: [...countsByDay.values()].reduce((sum, count) => {
      return sum + count;
    }, 0),
    capturedOn: busiestDay,
    visibleDayCount: days.length,
    firstCapturedOn: firstDay,
    lastCapturedOn: lastDay,
  };
}

/**
 * Steps 4 and 5 of § Recipient resolution: each candidate's intersection,
 * and their own count from it. An admin sees everything, so their
 * intersection is the batch's whole rule set.
 */
function _makeRecipientsFromCandidates(options: {
  candidates: readonly Candidate[];
  ruleDayCounts: readonly RuleDayCount[];
  visibleRuleIdsByMemberId: ReadonlyMap<string, ReadonlySet<string>>;
}): Recipient[] {
  const batchRuleIds = new Set(
    options.ruleDayCounts.map((row) => {
      return row.ruleId;
    }),
  );

  return options.candidates.flatMap((candidate) => {
    const visibleRuleIds =
      candidate.role === "admin"
        ? batchRuleIds
        : (options.visibleRuleIdsByMemberId.get(candidate.memberId) ??
          new Set<string>());
    const figures = _makeFiguresFromRuleDayCounts({
      ruleDayCounts: options.ruleDayCounts,
      visibleRuleIds,
    });
    return figures === undefined ? [] : [{ candidate, figures }];
  });
}

/**
 * Narrowest span first, then the earliest start, then the id: the band
 * `data-models.md` Decision 14 gives a day when no earlier day in a feed has
 * taken one, which an email about one day never has.
 */
function _compareBands(
  left: Readonly<{ id: string; startsOn: string; endsOn: string }>,
  right: Readonly<{ id: string; startsOn: string; endsOn: string }>,
): number {
  const leftSpan = Date.parse(left.endsOn) - Date.parse(left.startsOn);
  const rightSpan = Date.parse(right.endsOn) - Date.parse(right.startsOn);
  if (leftSpan !== rightSpan) {
    return leftSpan - rightSpan;
  }
  if (left.startsOn !== right.startsOn) {
    return left.startsOn < right.startsOn ? -1 : 1;
  }
  return left.id < right.id ? -1 : 1;
}

/**
 * The milestone band on each of these days, if any, in one query.
 *
 * Milestones have no visibility of their own (Decision 5), so a recipient's
 * restrictions never hide one and this needs no filtering.
 */
async function _readMilestoneNamesByDay(options: {
  transaction: DatabaseExecutor;
  days: readonly string[];
}): Promise<Map<string, string>> {
  const days = [...new Set(options.days)].sort();
  const firstDay = days[0];
  const lastDay = days.at(-1);
  if (firstDay === undefined || lastDay === undefined) {
    return new Map();
  }
  const milestones = await options.transaction
    .selectFrom("milestones")
    .select(["id", "name", "starts_on as startsOn", "ends_on as endsOn"])
    .where("starts_on", "<=", lastDay)
    .where("ends_on", ">=", firstDay)
    .execute();

  return new Map(
    days.flatMap((day) => {
      const [band] = milestones
        .filter((milestone) => {
          return milestone.startsOn <= day && milestone.endsOn >= day;
        })
        .sort(_compareBands);
      return band === undefined ? [] : [[day, band.name] as const];
    }),
  );
}

/** The uploader's name as every copy prints it. */
async function _readUploaderDisplayName(options: {
  transaction: DatabaseExecutor;
  uploadedBy: string;
}): Promise<string> {
  const uploader = await options.transaction
    .selectFrom("members")
    .select(["email", "display_name as storedDisplayName"])
    .where("id", "=", options.uploadedBy)
    .executeTakeFirstOrThrow();
  return getDisplayNameFromMember({
    storedDisplayName: uploader.storedDisplayName ?? undefined,
    email: uploader.email,
  });
}

/** One recipient's copy, with their own figures. */
async function _enqueueUploadSessionEmailForRecipient(options: {
  transaction: DatabaseExecutor;
  recipient: Readonly<Recipient>;
  context: Readonly<UploadEmailContext>;
}): Promise<void> {
  const { candidate, figures } = options.recipient;
  const { context } = options;
  await enqueueEmail({
    executor: options.transaction,
    now: context.now,
    input: {
      kind: "upload_session",
      toAddress: candidate.email,
      toMemberId: candidate.memberId,
      toDisplayName: candidate.displayName,
      // Verbatim from the recipe table. One row per recipient is what makes a
      // per-recipient count possible without a second message to anybody.
      idempotencyKey: `upload:${context.sessionId}:${candidate.memberId}`,
      triggerKind: "upload_session",
      triggerId: context.sessionId,
      payload: {
        uploaderDisplayName: context.uploaderDisplayName,
        ...figures,
        dayUrl: `${context.baseUrl}/?at=${figures.lastCapturedOn}`,
        // The band on the day `dayUrl` opens at, which is also the day the
        // multi-day copy means by "the last of them".
        milestoneName:
          context.milestoneNamesByDay.get(figures.lastCapturedOn) ?? null,
      },
    },
  });
}

/**
 * Every candidate who can see at least one item, with their own figures:
 * the three queries of § Recipient resolution, then steps 4 and 5.
 */
async function _readRecipients(
  options: Readonly<EnqueueUploadSessionEmailsOptions>,
): Promise<Recipient[]> {
  const [ruleDayCounts, candidates] = await Promise.all([
    _readRuleDayCounts(options),
    _readCandidates(options),
  ]);
  const visibleRuleIdsByMemberId = await _readVisibleRuleIdsByMemberId({
    transaction: options.transaction,
    memberIds: candidates
      .filter((candidate) => {
        return candidate.role !== "admin";
      })
      .map((candidate) => {
        return candidate.memberId;
      }),
    ruleIds: [
      ...new Set(
        ruleDayCounts.map((row) => {
          return row.ruleId;
        }),
      ),
    ],
  });
  return _makeRecipientsFromCandidates({
    candidates,
    ruleDayCounts,
    visibleRuleIdsByMemberId,
  });
}

/**
 * Queues the one `upload_session` message per recipient
 * (`apis/notifications.md` § 3).
 *
 * **The recipient set is three queries, never one per member**
 * (§ Recipient resolution is one set operation), and each recipient's count
 * falls out of the same intersection that admitted them: Inés gets 3 and
 * Abuela gets 210 from one pass. A batch spanning three weeks is still one
 * message per recipient, keyed `upload:<sessionId>:<memberId>`.
 *
 * Called only by `settleUploadSession`, inside the latch's transaction, and
 * only when the latch fired. It does not throw on a mail problem: an unset
 * `public.base_url` makes `enqueueEmail` write `failed` rows, and the batch
 * still settles.
 *
 * @param options.transaction The settle latch's transaction.
 * @param options.sessionId The batch that just settled.
 * @param options.uploadedBy The uploader, who is never told about their own.
 * @param options.now The settle time.
 * @returns How many rows were written, which `notified_member_count` records.
 */
export async function enqueueUploadSessionEmails(
  options: Readonly<EnqueueUploadSessionEmailsOptions>,
): Promise<{ recipientCount: number }> {
  const { transaction } = options;
  const [recipients, settings, uploaderDisplayName] = await Promise.all([
    _readRecipients(options),
    readInstanceSettings({ database: transaction, keys: ["public.base_url"] }),
    _readUploaderDisplayName(options),
  ]);
  const milestoneNamesByDay = await _readMilestoneNamesByDay({
    transaction,
    days: recipients.map((recipient) => {
      return recipient.figures.lastCapturedOn;
    }),
  });
  const context: UploadEmailContext = {
    sessionId: options.sessionId,
    uploaderDisplayName,
    baseUrl: settings["public.base_url"] ?? "",
    milestoneNamesByDay,
    now: options.now,
  };

  await Promise.all(
    recipients.map((recipient) => {
      return _enqueueUploadSessionEmailForRecipient({
        transaction,
        recipient,
        context,
      });
    }),
  );
  return { recipientCount: recipients.length };
}
