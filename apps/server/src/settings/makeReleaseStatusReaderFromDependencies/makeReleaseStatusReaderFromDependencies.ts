import { z } from "zod";
import {
  releaseVersionSchema,
  type ReleaseStatusResponse,
} from "@memory-shoebox/shared";

/** A cached read of the upstream release, independent of editable settings. */
export type ReleaseStatusReader = () => Promise<ReleaseStatusResponse>;

type Dependencies = {
  currentVersion: string;
  request?: typeof fetch;
  clock?: () => Date;
};

const RELEASE_SCHEMA = z.object({
  tag_name: z.string(),
  draft: z.literal(false),
  prerelease: z.literal(false),
});
const SUCCESS_CACHE_MS = 60 * 60 * 1000;
const FAILURE_CACHE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

function _isNewerVersion(
  options: Readonly<{ current: string; latest: string }>,
): boolean {
  const current = releaseVersionSchema
    .parse(options.current)
    .split(".")
    .map(BigInt);
  const latest = releaseVersionSchema
    .parse(options.latest)
    .split(".")
    .map(BigInt);
  const difference = latest.findIndex((part, index) => {
    return part !== current[index];
  });
  return difference !== -1 && latest[difference]! > current[difference]!;
}

async function _readReleaseStatus({
  currentVersion,
  request = fetch,
  clock = () => {
    return new Date();
  },
}: Readonly<Dependencies>): Promise<ReleaseStatusResponse> {
  try {
    const response = await request(
      "https://api.github.com/repos/jpsyx/memory-shoebox/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": "Memory-Shoebox",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error("Release lookup failed");
    }
    const release = RELEASE_SCHEMA.parse(await response.json());
    const latestVersion = releaseVersionSchema.parse(
      release.tag_name.replace(/^v/, ""),
    );
    return {
      status: _isNewerVersion({
        current: currentVersion,
        latest: latestVersion,
      })
        ? "update_available"
        : "up_to_date",
      latestVersion,
      checkedAt: clock().toISOString(),
    };
  } catch {
    return { status: "unavailable", latestVersion: null, checkedAt: null };
  }
}

/** Coalesces requests and bounds GitHub traffic, including during outages. */
export function makeReleaseStatusReaderFromDependencies(
  options: Readonly<Dependencies>,
): ReleaseStatusReader {
  const clock =
    options.clock ??
    (() => {
      return new Date();
    });
  let cached: { status: ReleaseStatusResponse; expiresAt: number } | undefined;
  let pending: Promise<ReleaseStatusResponse> | undefined;
  return async () => {
    if (cached !== undefined && clock().getTime() < cached.expiresAt) {
      return cached.status;
    }
    pending ??= _readReleaseStatus(options).then((status) => {
      const lifetime =
        status.status === "unavailable" ? FAILURE_CACHE_MS : SUCCESS_CACHE_MS;
      cached = { status, expiresAt: clock().getTime() + lifetime };
      pending = undefined;
      return status;
    });
    return pending;
  };
}
