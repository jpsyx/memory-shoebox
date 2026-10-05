import type { createTestApp } from "../../../apps/server/test/helpers/createTestApp.ts";
/**
 * Resources shared by fixture seeds and routes; the catalog alone closes them.
 */
export type AcceptanceContext = Awaited<ReturnType<typeof createTestApp>>;
