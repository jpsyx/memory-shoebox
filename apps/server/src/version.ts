import { readFileSync } from "node:fs";

/** Deployed root manifest version, read once for the process lifetime. */
export const SHOEBOX_VERSION: string = (() => {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
  );
  return typeof manifest === "object" &&
    manifest !== null &&
    "version" in manifest &&
    typeof manifest.version === "string"
    ? manifest.version
    : "unknown";
})();
