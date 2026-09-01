import { describe, expect, it } from "vitest";
import { buildRemediationPrompt, issueTag, repositoryTag } from "./prompt";

describe("buildRemediationPrompt", () => {
  it("requires browser evidence for UI work", () => {
    const prompt = buildRemediationPrompt(
      {
        number: 3,
        title: "Fix hover styles",
        body: "The hover treatment is inconsistent.",
        url: "https://github.com/example/repo/issues/3",
        state: "open",
        labels: [],
        category: "ui",
      },
      "example/repo",
    );

    expect(prompt).toContain("real browser");
    expect(prompt).toContain("before and after screenshots");
    expect(prompt).toContain("Fixes #3");
  });

  it("generates a deterministic issue tag", () => {
    expect(issueTag(14)).toBe("github-issue-14");
    expect(repositoryTag("Example/Frontend_App")).toBe(
      "github-repo-example-frontend-app",
    );
  });
});
