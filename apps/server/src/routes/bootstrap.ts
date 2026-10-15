import type { BootstrapResponse } from "@memory-shoebox/shared";
import type { FastifyInstance } from "fastify";
import { getMeDtoFromMemberId } from "../members/getMeDtoFromMemberId.ts";
import { readShellSettings } from "../settings/readShellSettings.ts";
import { readSetupProgress } from "../setup/readSetupProgress.ts";
import { readSetupStatus } from "../setup/readSetupStatus.ts";

/** Composes navigation reads using only this request's authenticated viewer. */
export async function bootstrapRoutes(app: FastifyInstance): Promise<void> {
  app.get("/bootstrap", async (request, reply): Promise<BootstrapResponse> => {
    reply.header("Cache-Control", "no-store");
    const database = request.server.database;
    const setup = await readSetupStatus(database);
    const viewer = request.viewer;
    if (setup.isRequired || viewer === undefined) {
      return { setup, account: null, progress: null };
    }
    const account = {
      me: await getMeDtoFromMemberId({ database, memberId: viewer.memberId }),
      settings: await readShellSettings(database),
    };
    const progress =
      viewer.isAdmin && account.me.role === "admin"
        ? await readSetupProgress({ database, viewer })
        : null;
    return { setup, account, progress };
  });
}
