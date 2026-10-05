import { fileURLToPath } from "node:url";
import { getMediaResponseFromFile } from "./getMediaResponseFromFile.ts";
import type { AcceptanceContext } from "./acceptanceTypes.ts";
import type { seedAcceptanceMembers } from "./seedAcceptanceMembers.ts";
/** Register only test-owned session/scenario/media routes before startup. */
export function registerAcceptanceRoutes(
  context: Readonly<AcceptanceContext>,
  members: Readonly<Awaited<ReturnType<typeof seedAcceptanceMembers>>>,
  mediaByKey: ReadonlyMap<string, string>,
  getOrigin: () => string,
): void {
  context.b2.presignGet = async ({ key }) => {
    return `${getOrigin()}/api/evidence/media/${encodeURIComponent(key)}`;
  };
  _registerMedia(context.app, mediaByKey);
  _registerScenario(context, members.secondAdmin);
  _registerSessions(context.app, members);
}
function _registerMedia(
  app: AcceptanceContext["app"],
  mediaByKey: ReadonlyMap<string, string>,
): void {
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
      const mediaResponse = await getMediaResponseFromFile({
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
function _registerScenario(
  { app, database }: Readonly<AcceptanceContext>,
  secondAdmin: string,
): void {
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
function _registerSessions(
  app: AcceptanceContext["app"],
  {
    admin,
    viewer,
  }: Readonly<Awaited<ReturnType<typeof seedAcceptanceMembers>>>,
): void {
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
