import { uploadSessionDetailSchema } from "@memory-shoebox/shared";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertUploadSession,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _makeApp() {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
}

/**
 * The same catalog, but every result arrives a macrotask late.
 *
 * In memory, one request's check and write run back to back before the next
 * request is scheduled, so two taps never overlap and a missing lock would
 * go unnoticed. The delay opens the gap between a read and the write after
 * it, which is the gap `BEGIN IMMEDIATE` has to close.
 */
function _makeSlowDatabaseFromDatabase(
  database: Kysely<Database>,
): Kysely<Database> {
  return database.withPlugin({
    transformQuery: ({ node }) => {
      return node;
    },
    transformResult: async ({ result }) => {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      return result;
    },
  });
}

const OPEN = {
  method: "POST",
  url: "/api/upload-sessions",
  payload: { clientTimezone: "Europe/Madrid" },
} as const;

describe("POST /api/upload-sessions", () => {
  it("opens an empty draft under the everyone rule, and touches no bucket", async () => {
    const { app, database, b2, close } = await _makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });

    const response = await app.inject({ ...OPEN, headers: { cookie } });

    expect(response.statusCode).toBe(201);
    const detail = uploadSessionDetailSchema.parse(response.json());
    expect(detail).toMatchObject({
      state: "draft",
      uploadedBy: { memberId },
      visibility: { visibilityRuleId: "visibility-rule-everyone" },
      clientTimezone: "Europe/Madrid",
      fileCount: 0,
      totalBytes: 0,
      createdAt: NOW,
      lastActivityAt: NOW,
      committedAt: null,
      files: [],
      nextCursor: null,
    });
    expect(b2.calls).toEqual([]);
    await close();
  });

  it("refuses a zone Intl cannot resolve, naming the field", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      ...OPEN,
      headers: { cookie },
      payload: { clientTimezone: "Mars/Base" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    expect(response.json().details.fieldErrors.clientTimezone).toBeDefined();
    await close();
  });

  it("is 401 without a session", async () => {
    const { app, close } = await _makeApp();

    const response = await app.inject(OPEN);

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("not_signed_in");
    await close();
  });

  it("is 403 for a viewer, and writes nothing", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });

    const response = await app.inject({ ...OPEN, headers: { cookie } });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("upload_forbidden");
    expect(
      await database.selectFrom("upload_sessions").selectAll().execute(),
    ).toEqual([]);
    await close();
  });

  it("is 409 while a batch is open, naming the one to pick up", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const first = await app.inject({ ...OPEN, headers: { cookie } });
    const second = await app.inject({ ...OPEN, headers: { cookie } });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: "upload_session_conflict",
      details: { sessionId: first.json().sessionId },
    });
    await close();
  });

  it("opens one draft when two taps arrive together, and the second names the first", async () => {
    const { app, database, close } = await createTestApp({
      database: _makeSlowDatabaseFromDatabase(createDatabase(":memory:")),
      clock: () => {
        return new Date(NOW);
      },
    });
    const { cookie } = await insertSignedInMember({ database });

    const responses = await Promise.all([
      app.inject({ ...OPEN, headers: { cookie } }),
      app.inject({ ...OPEN, headers: { cookie } }),
    ]);

    const opened = responses.filter((response) => {
      return response.statusCode === 201;
    });
    const refused = responses.filter((response) => {
      return response.statusCode === 409;
    });
    expect(opened).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]?.json()).toMatchObject({
      error: "upload_session_conflict",
      details: { sessionId: opened[0]?.json().sessionId },
    });
    expect(
      await database.selectFrom("upload_sessions").select("id").execute(),
    ).toEqual([{ id: opened[0]?.json().sessionId }]);
    await close();
  });

  it("opens a new batch once the last one is settled or cancelled", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: NOW,
    });
    await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "cancelled",
      committed_at: null,
    });

    const response = await app.inject({ ...OPEN, headers: { cookie } });

    expect(response.statusCode).toBe(201);
    await close();
  });
});

describe("GET /api/upload-sessions/current", () => {
  it("is 204 with no body when nothing is in flight", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "GET",
      url: "/api/upload-sessions/current",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    await close();
  });

  it("answers byte for byte what the session's own route does", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const opened = await app.inject({ ...OPEN, headers: { cookie } });

    const current = await app.inject({
      method: "GET",
      url: "/api/upload-sessions/current",
      headers: { cookie },
    });
    const addressed = await app.inject({
      method: "GET",
      url: `/api/upload-sessions/${opened.json().sessionId}`,
      headers: { cookie },
    });

    expect(current.statusCode).toBe(200);
    expect(current.body).toBe(addressed.body);
    await close();
  });

  it("never answers with another member's batch, not even for an admin", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "admin" },
    });
    const otherId = await insertMember(database);
    await insertUploadSession(database, { uploadedBy: otherId });

    const response = await app.inject({
      method: "GET",
      url: "/api/upload-sessions/current",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    await close();
  });

  it("is 403 for a viewer and 401 without a session", async () => {
    const { app, database, close } = await _makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });

    const asViewer = await app.inject({
      method: "GET",
      url: "/api/upload-sessions/current",
      headers: { cookie },
    });
    const anonymous = await app.inject({
      method: "GET",
      url: "/api/upload-sessions/current",
    });

    expect(asViewer.statusCode).toBe(403);
    expect(asViewer.json().error).toBe("upload_forbidden");
    expect(anonymous.statusCode).toBe(401);
    await close();
  });
});
