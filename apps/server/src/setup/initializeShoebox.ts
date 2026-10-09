import { syncMemberPerson } from "../members/syncMemberPerson.ts";
import {
  createSetupRequestSchema,
  type CreateSetupRequest,
  type CreateSessionResponse,
} from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  createSessionForMember,
  type CreatedSession,
} from "../auth/createSessionForMember.ts";
import { getMeDtoFromMemberId } from "../members/getMeDtoFromMemberId.ts";
import { readShellSettings } from "../settings/readShellSettings.ts";
import { saveInstanceSetting } from "../settings/saveInstanceSetting.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";
import { readSetupStatus } from "./readSetupStatus.ts";

type InitializeShoeboxOptions = {
  database: DatabaseExecutor;
  body: CreateSetupRequest;
  userAgent: string | undefined;
  now: string;
};
const SETUP_SETTING_KEYS = [
  "shoebox.name",
  "shoebox.timezone",
  "pile.arrangement",
  "public.base_url",
  "mail.from_address",
  "mail.from_name",
  "setup.pending_member_id",
] as const;
type SetupSettingKey = (typeof SETUP_SETTING_KEYS)[number];
type SaveSetupSettingsOptions = {
  transaction: DatabaseExecutor;
  body: CreateSetupRequest;
  viewer: Viewer;
  now: string;
};

async function _insertInitialAdmin(
  options: Readonly<{
    transaction: DatabaseExecutor;
    body: CreateSetupRequest;
    now: string;
  }>,
): Promise<string> {
  const memberId = createId();
  await options.transaction
    .insertInto("members")
    .values({
      id: memberId,
      email: options.body.admin.email,
      display_name: options.body.admin.displayName,
      role: "admin",
      status: "active",
      notify_on_upload: 1,
      notify_on_comment: 1,
      notify_on_reply: 1,
      notify_on_removal: 1,
      joined_at: options.now,
      last_signed_in_at: options.now,
      last_seen_at: null,
      removed_at: null,
      created_at: options.now,
    })
    .execute();
  return memberId;
}

function _getSettingValuesFromSetup(
  options: Readonly<{ body: CreateSetupRequest; memberId: string }>,
): Record<SetupSettingKey, string | undefined> {
  const { body, memberId } = options;
  return {
    "shoebox.name": body.shoebox.name,
    "shoebox.timezone": body.shoebox.timezone,
    "pile.arrangement": "messy",
    "public.base_url": body.public.baseUrl,
    "mail.from_address": body.mail?.fromAddress ?? undefined,
    "mail.from_name":
      body.mail?.fromName ??
      (body.mail?.fromAddress ? body.shoebox.name : undefined),
    "setup.pending_member_id": memberId,
  };
}

async function _saveSetupSettings(
  options: Readonly<SaveSetupSettingsOptions>,
): Promise<void> {
  const { transaction, body, viewer, now } = options;
  const current = await readInstanceSettings({
    database: transaction,
    keys: SETUP_SETTING_KEYS,
  });
  const values = _getSettingValuesFromSetup({
    body,
    memberId: viewer.memberId,
  });
  await SETUP_SETTING_KEYS.reduce(async (previousWrite, key) => {
    await previousWrite;
    await saveInstanceSetting({
      transaction,
      key,
      value: values[key] ?? null,
      memberId: viewer.memberId,
      now,
    });
  }, Promise.resolve());
  await SETUP_SETTING_KEYS.reduce(async (previousEvent, key) => {
    await previousEvent;
    if ((current[key] ?? undefined) !== values[key]) {
      await writeActivityEvent({
        transaction,
        viewer,
        kind: "setting_changed",
        subjectKind: "setting",
        subjectId: key,
        subjectLabel: key,
        detail: { fromValue: current[key], toValue: values[key] ?? null },
        now,
      });
    }
  }, Promise.resolve());
}

async function _getResponseFromInitialSession(
  options: Readonly<{
    transaction: DatabaseExecutor;
    memberId: string;
    session: CreatedSession;
  }>,
): Promise<CreateSessionResponse> {
  const { transaction, memberId, session } = options;
  return {
    me: await getMeDtoFromMemberId({ database: transaction, memberId }),
    session: {
      sessionId: session.sessionId,
      deviceLabel: session.deviceLabel,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      isCurrent: true,
    },
    isFirstSignIn: true,
    settings: await readShellSettings(transaction),
  };
}

/**
 * Creates the sole initial admin and bootstrap response under the writer lock.
 */
export async function initializeShoebox(
  options: Readonly<InitializeShoeboxOptions>,
): Promise<{ response: CreateSessionResponse; token: string }> {
  const body = createSetupRequestSchema.parse(options.body);
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      if (!(await readSetupStatus(transaction)).isRequired) {
        throw ApiError.conflict({ code: "setup_already_completed" });
      }
      const memberId = await _insertInitialAdmin({
        transaction,
        body,
        now: options.now,
      });
      await syncMemberPerson({ transaction, memberId, now: options.now });
      const session = await createSessionForMember({
        transaction,
        memberId,
        userAgent: options.userAgent,
        now: options.now,
      });
      const viewer: Viewer = {
        memberId,
        sessionId: session.sessionId,
        role: "admin",
        isAdmin: true,
        visibleRuleIds: [],
      };
      await _saveSetupSettings({ transaction, body, viewer, now: options.now });
      const response = await _getResponseFromInitialSession({
        transaction,
        memberId,
        session,
      });
      return { response, token: session.token };
    },
  });
}
