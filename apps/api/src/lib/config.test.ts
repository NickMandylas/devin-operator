import { afterEach, describe, expect, it } from "vitest";
import { getRepositoryConfig, getRepositoryConfigs } from "./config";

const originalRepositories = process.env.GITHUB_REPOSITORIES;

afterEach(() => {
  if (originalRepositories === undefined) {
    delete process.env.GITHUB_REPOSITORIES;
  } else {
    process.env.GITHUB_REPOSITORIES = originalRepositories;
  }
});

describe("repository configuration", () => {
  it("parses and selects multiple repositories", () => {
    process.env.GITHUB_REPOSITORIES = JSON.stringify([
      { repository: "example/frontend", trackedIssues: [2, 7] },
      { repository: "example/backend", trackedIssues: [4] },
    ]);

    expect(getRepositoryConfigs()).toHaveLength(2);
    expect(getRepositoryConfig("example/backend")).toMatchObject({
      owner: "example",
      repo: "backend",
      trackedIssues: [4],
    });
  });

  it("rejects repositories outside the configured set", () => {
    process.env.GITHUB_REPOSITORIES = JSON.stringify([
      { repository: "example/frontend", trackedIssues: [2] },
    ]);

    expect(() => getRepositoryConfig("other/repository")).toThrow(
      "is not configured",
    );
  });
});
