import { describe, expect, it } from "vitest";
import type { VisibilitySummary } from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const setUp = async (
  sessionOverrides: Partial<Database["upload_sessions"]> = {},
) => {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const { cookie, memberId } = await insertSignedInMember({
    database: testApp.database,
  });
  const sessionId = await insertUploadSession(testApp.database, {
    uploadedBy: memberId,
    state: "draft",
    committed_at: null,
    file_count: 0,
    total_bytes: 0,
    last_activity_at: shiftMinutes({ instant: NOW, minutes: -30 }),
    ...sessionOverrides,
  });
  const patchVisibility = (payload: Record<string, unknown>) => {
    return testApp.app.inject({
      method: "PATCH",
      url: `/api/upload-sessions/${sessionId}/visibility`,
      headers: { cookie },
      payload,
    });
  };
  const readSession = () => {
    return testApp.database
      .selectFrom("upload_sessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
  };
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    patchVisibility,
    readSession,
  };
};

describe("PATCH /api/upload-sessions/:sessionId/visibility", () => {
  it("points the batch at one rule, and finds it again rather than making two", async () => {
    const { database, patchVisibility, readSession, close } = await setUp();
    const relativeId = await insertMember(database, {
      display_name: "Tía Inés",
    });
    const subjects = [{ kind: "member", id: relativeId }];

    const first = await patchVisibility({ mode: "only", subjects });
    const second = await patchVisibility({ mode: "only", subjects });

    expect(first.statusCode).toBe(200);
    const summary = first.json<VisibilitySummary>();
    expect(summary.mode).toBe("only");
    expect(summary.subjects).toEqual([
      expect.objectContaining({ kind: "member", id: relativeId }),
    ]);
    expect(second.json<VisibilitySummary>().visibilityRuleId).toBe(
      summary.visibilityRuleId,
    );
    const session = await readSession();
    expect(session.visibility_rule_id).toBe(summary.visibilityRuleId);
    expect(session.last_activity_at).toBe(NOW);
    expect(
      await database.selectFrom("visibility_rules").select("id").execute(),
    ).toHaveLength(2);
    await close();
  });

  it("goes back to everyone through the seeded rule", async () => {
    const { database, patchVisibility, readSession, close } = await setUp();
    const relativeId = await insertMember(database);
    await patchVisibility({
      mode: "except",
      subjects: [{ kind: "member", id: relativeId }],
    });

    const response = await patchVisibility({ mode: "everyone", subjects: [] });

    expect(response.statusCode).toBe(200);
    expect(response.json<VisibilitySummary>()).toMatchObject({
      visibilityRuleId: EVERYONE_VISIBILITY_RULE_ID,
      mode: "everyone",
    });
    expect((await readSession()).visibility_rule_id).toBe(
      EVERYONE_VISIBILITY_RULE_ID,
    );
    await close();
  });

  it("refuses the bodies the control would never send", async () => {
    const { database, patchVisibility, readSession, close } = await setUp();
    const relativeId = await insertMember(database);
    const removedId = await insertMember(database, {
      status: "removed",
      removed_at: NOW,
    });

    const responses = [
      await patchVisibility({
        mode: "everyone",
        subjects: [{ kind: "member", id: relativeId }],
      }),
      await patchVisibility({ mode: "only", subjects: [] }),
      await patchVisibility({ mode: "except", subjects: [] }),
      await patchVisibility({
        mode: "only",
        subjects: [{ kind: "member", id: removedId }],
      }),
    ];

    expect(
      responses.map((response) => {
        return [response.statusCode, response.json().error];
      }),
    ).toEqual([
      [400, "invalid_request"],
      [400, "invalid_request"],
      [400, "invalid_request"],
      [400, "invalid_request"],
    ]);
    expect((await readSession()).visibility_rule_id).toBe(
      EVERYONE_VISIBILITY_RULE_ID,
    );
    await close();
  });

  it("freezes at commit", async () => {
    const { patchVisibility, close } = await setUp({
      state: "uploading",
      committed_at: NOW,
    });

    const response = await patchVisibility({ mode: "everyone", subjects: [] });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("upload_session_conflict");
    await close();
  });

  it("is the uploader's alone: one 404 for anybody else, an admin included", async () => {
    const { app, database, sessionId, close } = await setUp();
    const { cookie: otherCookie } = await insertSignedInMember({
      database,
      token: "other-uploader",
    });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });
    const viewer = await insertSignedInMember({
      database,
      token: "viewer",
      member: { role: "viewer" },
    });
    const viewerSessionId = await insertUploadSession(database, {
      uploadedBy: viewer.memberId,
      state: "draft",
      committed_at: null,
    });
    const send = (sessionIdToSend: string, cookie: string) => {
      return app.inject({
        method: "PATCH",
        url: `/api/upload-sessions/${sessionIdToSend}/visibility`,
        headers: { cookie },
        payload: { mode: "everyone", subjects: [] },
      });
    };

    const forOther = await send(sessionId, otherCookie);
    const forAdmin = await send(sessionId, adminCookie);
    const forNothing = await send(createId(), otherCookie);
    const forViewer = await send(viewerSessionId, viewer.cookie);

    expect(forOther.statusCode).toBe(404);
    expect(forOther.json().error).toBe("upload_session_not_found");
    expect(forAdmin.body).toBe(forOther.body);
    expect(forNothing.body).toBe(forOther.body);
    expect(forViewer.statusCode).toBe(403);
    expect(forViewer.json().error).toBe("upload_forbidden");
    await close();
  });
});
