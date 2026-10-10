import {
  getLogFromRange,
  getTagsFromRemoteMain,
  getVersionFromRef,
  isAncestor,
  MANIFEST_PATHS,
  runGit,
  syncManifestVersions,
} from "./git";
import { getVersionFromCommits } from "./version";

/** The remote publication boundary, injectable for local Git integration tests. */
export type GitHubPublisher = {
  hasRelease: (tag: string) => Promise<boolean>;
  publish: (release: {
    tag: string;
    commit: string;
    notes: string;
  }) => Promise<void>;
};
/** Inputs needed to verify and release one cumulative main range. */
export type ReleaseOptions = {
  repository: string;
  eventCommit: string;
  github: GitHubPublisher;
  verify: (commit: string) => Promise<void>;
};
/** Persisted annotated-tag metadata used to repair interrupted publication. */
type ReleaseMetadata = { source: string; previousTag?: string };
const TAG_MARKER = "Memory Shoebox automatic release\n";

function _getMetadataFromTag(options: {
  repository: string;
  tag: string;
}): ReleaseMetadata | undefined {
  const contents = runGit({
    repository: options.repository,
    args: ["for-each-ref", "--format=%(contents)", `refs/tags/${options.tag}`],
  });
  if (!contents.startsWith(TAG_MARKER)) {
    return undefined;
  }
  const metadata: unknown = JSON.parse(contents.slice(TAG_MARKER.length));
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("source" in metadata) ||
    typeof metadata.source !== "string" ||
    !/^[0-9a-f]{40}$/.test(metadata.source)
  ) {
    throw new Error(`Invalid automatic release metadata: ${options.tag}`);
  }
  const previousTag =
    "previousTag" in metadata ? metadata.previousTag : undefined;
  if (
    previousTag !== undefined &&
    (typeof previousTag !== "string" || !/^v\d+\.\d+\.\d+$/.test(previousTag))
  ) {
    throw new Error(`Invalid previous release metadata: ${options.tag}`);
  }
  return { source: metadata.source, previousTag };
}

async function _repairRelease(options: {
  repository: string;
  tag: string;
  github: GitHubPublisher;
}): Promise<void> {
  const metadata = _getMetadataFromTag(options);
  if (metadata === undefined) {
    return;
  }
  const commit = runGit({
    repository: options.repository,
    args: ["rev-parse", `${options.tag}^{commit}`],
  });
  const source = runGit({
    repository: options.repository,
    args: ["rev-parse", `${commit}^`],
  });
  if (
    source !== metadata.source ||
    getVersionFromRef({ repository: options.repository, ref: options.tag }) !==
      options.tag.slice(1)
  ) {
    throw new Error(
      `Automatic release tag does not match its version commit: ${options.tag}`,
    );
  }
  if (!(await options.github.hasRelease(options.tag))) {
    const notes = getLogFromRange({
      repository: options.repository,
      ...metadata,
      format: "- %h %s",
    });
    await options.github.publish({ tag: options.tag, commit, notes });
  }
}

function _prepareVersionCommit(options: {
  repository: string;
  source: string;
  previousTag?: string;
}): { tag: string; commit: string; metadata: ReleaseMetadata } {
  const messages = getLogFromRange({ ...options, format: "%B%x00" })
    .split("\0")
    .map((message) => {
      return message.trim();
    });
  const previousVersion = options.previousTag?.slice(1);
  const sourceVersion = getVersionFromRef({
    repository: options.repository,
    ref: options.source,
  });
  if (previousVersion !== undefined && sourceVersion !== previousVersion) {
    throw new Error(
      "Source manifests must retain the last automatic release version",
    );
  }
  const version = getVersionFromCommits({ previousVersion, messages });
  syncManifestVersions({ repository: options.repository, version });
  const commit = _commitManifests({ repository: options.repository, version });
  return {
    tag: `v${version}`,
    commit,
    metadata: { source: options.source, previousTag: options.previousTag },
  };
}

function _commitManifests(options: {
  repository: string;
  version: string;
}): string {
  const { repository, version } = options;
  runGit({ repository, args: ["add", "--", ...MANIFEST_PATHS] });
  runGit({ repository, args: ["commit", "-m", `chore(release): v${version}`] });
  return runGit({ repository, args: ["rev-parse", "HEAD"] });
}

function _assertRemoteSource(options: {
  repository: string;
  source: string;
}): void {
  const remoteHead = runGit({
    repository: options.repository,
    args: ["ls-remote", "origin", "refs/heads/main"],
  }).split("\t")[0];
  if (remoteHead !== options.source) {
    throw new Error(
      "Remote main advanced during checks. Rerun the release workflow to check the new candidate.",
    );
  }
}

function _pushVersionCommit(options: {
  repository: string;
  source: string;
  tag: string;
  commit: string;
  metadata: ReleaseMetadata;
}): void {
  _assertRemoteSource(options);
  runGit({
    repository: options.repository,
    args: [
      "tag",
      "-a",
      options.tag,
      options.commit,
      "-m",
      `${TAG_MARKER}${JSON.stringify(options.metadata)}`,
    ],
  });
  try {
    runGit({
      repository: options.repository,
      args: [
        "push",
        "--atomic",
        "origin",
        `${options.commit}:refs/heads/main`,
        `refs/tags/${options.tag}:refs/tags/${options.tag}`,
      ],
    });
  } catch (error) {
    throw new Error(
      "Atomic release push rejected. Main may have moved; rerun. Otherwise allow contents:write and release-bot writes in main/tag branch rules (see docs/releases.md). No force push was attempted.",
      { cause: error },
    );
  }
}

function _getReleaseSourceFromEvent(options: {
  repository: string;
  eventCommit: string;
}): string {
  const { repository, eventCommit } = options;
  runGit({
    repository,
    args: [
      "fetch",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
      "--tags",
    ],
  });
  const source = runGit({ repository, args: ["rev-parse", "origin/main"] });
  if (!isAncestor({ repository, ancestor: eventCommit, descendant: source })) {
    throw new Error(
      "Release event is no longer on remote main; rerun for the current branch",
    );
  }
  return source;
}

/** Publish a checked version commit or repair an interrupted publication. */
export async function publishRelease(options: ReleaseOptions): Promise<void> {
  const { repository, eventCommit, github, verify } = options;
  if (!/^[0-9a-f]{40}$/.test(eventCommit)) {
    throw new Error("Release event must identify an exact source commit");
  }
  if (runGit({ repository, args: ["status", "--porcelain"] }) !== "") {
    throw new Error("Release requires a clean disposable checkout");
  }
  const source = _getReleaseSourceFromEvent({ repository, eventCommit });
  const tags = getTagsFromRemoteMain(repository);
  await tags.reduce(async (previous, tag) => {
    await previous;
    await _repairRelease({ repository, tag, github });
  }, Promise.resolve());
  const previousTag = tags.at(-1);
  if (
    previousTag !== undefined &&
    isAncestor({ repository, ancestor: eventCommit, descendant: previousTag })
  ) {
    return;
  }
  runGit({ repository, args: ["checkout", "--detach", source] });
  const candidate = _prepareVersionCommit({ repository, source, previousTag });
  await verify(candidate.commit);
  if (
    runGit({ repository, args: ["rev-parse", "HEAD"] }) !== candidate.commit ||
    runGit({ repository, args: ["status", "--porcelain"] }) !== ""
  ) {
    throw new Error(
      "Checks changed the version candidate; refusing to publish unchecked content",
    );
  }
  _pushVersionCommit({ repository, source, ...candidate });
  await _repairRelease({ repository, tag: candidate.tag, github });
}
