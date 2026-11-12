const releaseTag =
  /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.(?:0|[1-9]\d*))?$/;

const commitId = /^[0-9a-f]{7,40}$/;

/*
 * Choose the words for the build that is running.
 * A release tag is kept. 1.0.0 is the placeholder in package.json and is left
 * out, and so is any other value that is not a release tag. The commit is the
 * short id baked in at build time. With neither, there is nothing to show.
 */
export function runningBuildLabel(
  version: string | undefined,
  commit: string | undefined,
): string | null {
  const trimmedVersion = version?.trim() ?? "";
  const shownVersion = releaseTag.test(trimmedVersion) ? trimmedVersion : "";
  const rawCommit = commit?.trim().toLowerCase() ?? "";
  const shownCommit = commitId.test(rawCommit) ? rawCommit.slice(0, 8) : "";

  if (shownVersion && shownCommit) {
    return `${shownVersion} ${shownCommit}`;
  }
  if (shownVersion) {
    return shownVersion;
  }
  if (shownCommit) {
    return shownCommit;
  }
  return null;
}
