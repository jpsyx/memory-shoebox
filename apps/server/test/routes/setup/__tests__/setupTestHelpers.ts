import type { CreateSetupRequest } from "@memory-shoebox/shared";

/** Shared setup test input. */
export const NOW = "2026-10-04T12:00:00.000Z" satisfies string;

/** Shared setup test input. */
export const BODY = {
  admin: { displayName: "  Rosa  ", email: " ROSA@Example.com " },
  shoebox: { name: "Rosa's Shoebox", timezone: "America/New_York" },
  public: { baseUrl: "https://photos.example.com" },
} as const satisfies CreateSetupRequest;
