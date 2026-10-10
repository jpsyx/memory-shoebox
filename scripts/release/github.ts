import type { GitHubPublisher } from "./release";

/** Construct the workflow-only GitHub API boundary from explicit credentials. */
export function makeGitHubPublisherFromConfig(options: {
  repository: string;
  token: string;
  request?: typeof fetch;
}): GitHubPublisher {
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repository) || options.token === "") {
    throw new Error("Release requires a GitHub repository and workflow token");
  }
  const request = options.request ?? fetch;
  const baseUrl = `https://api.github.com/repos/${options.repository}/releases`;
  const headers = {
    Authorization: `Bearer ${options.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  return {
    hasRelease: async (tag) => {
      const response = await request(
        `${baseUrl}/tags/${encodeURIComponent(tag)}`,
        { headers },
      );
      if (response.status === 404) {
        return false;
      }
      _assertSuccessfulResponse(response);
      return true;
    },
    publish: async ({ tag, commit, notes }) => {
      const response = await request(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tag_name: tag,
          target_commitish: commit,
          name: tag,
          body: notes,
          draft: false,
          prerelease: false,
        }),
      });
      _assertSuccessfulResponse(response);
    },
  };
}

function _assertSuccessfulResponse(response: Response): void {
  if (!response.ok) {
    throw new Error(
      `GitHub release API failed (HTTP ${response.status}). Check Actions contents:write permissions, then rerun; existing tags will be repaired.`,
    );
  }
}
