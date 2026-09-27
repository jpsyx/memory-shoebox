/**
 * The API contract shared by the server and the web app.
 *
 * Each endpoint contributes a Zod schema plus the type inferred from it, so
 * there is a single source of truth for every payload crossing the wire. The
 * web app parses responses with the schema; the server annotates its handlers
 * with the type.
 *
 * This file is a barrel and holds no definitions: the contract is large enough
 * that one file would be unreadable, and the import path stays
 * `@memory-shoebox/shared` either way.
 *
 * Both halves may import at runtime. The server runs TypeScript directly
 * through Node's type stripping, and a runtime import from this package has
 * been verified to load under it (`docs/shared.md`).
 */
export * from "./collections.ts";
export * from "./dtos.ts";
export * from "./errors.ts";
export * from "./health.ts";
export * from "./limits.ts";
export * from "./settings.ts";
