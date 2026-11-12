import { describe, expect, it } from "vitest";
import { runningBuildLabel } from "./runningBuild";

describe("runningBuildLabel", () => {
  it("shows the commit when no release exists", () => {
    expect(runningBuildLabel("", "fccb2e83")).toBe("fccb2e83");
    expect(runningBuildLabel("1.0.0", "fccb2e83")).toBe("fccb2e83");
    expect(runningBuildLabel(undefined, "fccb2e83d26e87ec")).toBe("fccb2e83");
  });

  it("shows the release tag and the commit once a release exists", () => {
    expect(runningBuildLabel("v0.1.0", "fccb2e83")).toBe("v0.1.0 fccb2e83");
    expect(runningBuildLabel("v1.2.3-rc.1", "abc123de")).toBe(
      "v1.2.3-rc.1 abc123de",
    );
  });

  it("shows nothing for the placeholder version on its own", () => {
    expect(runningBuildLabel("1.0.0", "")).toBeNull();
    expect(runningBuildLabel("1.0.0", undefined)).toBeNull();
    expect(runningBuildLabel("", "")).toBeNull();
  });

  it("ignores a version that is not a release tag", () => {
    expect(runningBuildLabel("latest", "fccb2e83")).toBe("fccb2e83");
    expect(runningBuildLabel("0.1.0", "fccb2e83")).toBe("fccb2e83");
  });
});
