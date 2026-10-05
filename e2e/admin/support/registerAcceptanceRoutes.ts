import { fileURLToPath } from "node:url";
import { makeMediaResponseFromFile } from "./makeMediaResponseFromFile.ts";
import type { AcceptanceContext } from "./acceptance.types.ts";
import type { seedAcceptanceMembers } from "./seedAcceptanceMembers.ts";
type RegisterAcceptanceRoutesOptions = {
  context: Readonly<AcceptanceContext>;
  members: Readonly<Awaited<ReturnType<typeof seedAcceptanceMembers>>>;
  mediaByKey: ReadonlyMap<string, string>;
  getOrigin: () => string;
};
function _registerMedia({
  app,
  mediaByKey,
}: Readonly<{
  app: AcceptanceContext["app"];
  mediaByKey: ReadonlyMap<string, string>;
}>): void {
  app.get<{ Params: { key: string } }>(
    "/api/evidence/media/:key",
    async (request, reply) => {
      const filename = mediaByKey.get(request.params.key);
      if (!filename) {
        return reply.code(404).send();
      }
      const path = fileURLToPath(
        new URL(
          `../../fixtures/cartoon-media/web/${filename}`,
          import.meta.url,
        ),
      );
      const mediaResponse = await makeMediaResponseFromFile({
        path,
        range: request.headers.range,
      });
      return reply
        .code(mediaResponse.status)
        .headers(mediaResponse.headers)
        .send(mediaResponse.body);
    },
  );
}

function _registerScenario({
  context: { app, database },
  secondAdmin,
}: Readonly<{
  context: Readonly<AcceptanceContext>;
  secondAdmin: string;
}>): void {
  app.post<{ Body: { lastAdmin?: boolean } }>(
    "/api/evidence/scenario",
    async (request) => {
      if (request.body.lastAdmin !== undefined) {
        await database
          .updateTable("members")
          .set({ role: request.body.lastAdmin ? "uploader" : "admin" })
          .where("id", "=", secondAdmin)
          .execute();
      }
      return { ok: true };
    },
  );
}

function _registerSessions({
  app,
  members: { admin, viewer },
}: Readonly<{
  app: AcceptanceContext["app"];
  members: Readonly<Awaited<ReturnType<typeof seedAcceptanceMembers>>>;
}>): void {
  app.get<{ Params: { role: string }; Querystring: { to?: string } }>(
    "/api/evidence/session/:role",
    async (request, reply) => {
      const session = request.params.role === "viewer" ? viewer : admin;
      const target =
        request.query.to?.startsWith("/") && !request.query.to.startsWith("//")
          ? request.query.to
          : "/";
      return reply
        .header(
          "set-cookie",
          `shoebox_session=${session.token}; Path=/; HttpOnly; SameSite=Lax`,
        )
        .redirect(target);
    },
  );
}

/** Register only test-owned session/scenario/media routes before startup. */
export function registerAcceptanceRoutes({
  context,
  members,
  mediaByKey,
  getOrigin,
}: Readonly<RegisterAcceptanceRoutesOptions>): void {
  context.b2.presignGet = async ({ key }) => {
    return `${getOrigin()}/api/evidence/media/${encodeURIComponent(key)}`;
  };
  _registerMedia({
    app: context.app,
    mediaByKey,
  });
  _registerScenario({
    context,
    secondAdmin: members.secondAdmin,
  });
  _registerSessions({
    app: context.app,
    members,
  });
}
