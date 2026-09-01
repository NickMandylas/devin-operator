import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startIssueSession } from "./automation";
import { listRepositoryIssues } from "./github-client";

const ENV_KEYS = ["DEVIN_API_TOKEN", "DEVIN_ORG_ID"] as const;
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function githubIssue(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: "",
    html_url: `https://github.com/NickMandylas/superset/issues/${number}`,
    state: "open",
    labels: [],
    ...overrides,
  };
}

beforeEach(() => {
  process.env.DEVIN_API_TOKEN = "cog_test";
  process.env.DEVIN_ORG_ID = "org-test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe("listRepositoryIssues", () => {
  it("returns open issues sorted by number and filters out pull requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        githubIssue(5, { title: "[scan] flask 2.3.3 has known vulnerabilities" }),
        githubIssue(1),
        githubIssue(7, { pull_request: { url: "https://example.com/pr" } }),
        githubIssue(3),
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const issues = await listRepositoryIssues();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/repos/NickMandylas/superset/issues?state=open&per_page=100&page=1",
    );
    expect(issues.map((issue) => issue.number)).toEqual([1, 3, 5]);
    expect(issues[2].category).toBeDefined();
  });

  it("paginates until a page comes back short", async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) =>
      githubIssue(index + 1),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(fullPage))
      .mockResolvedValueOnce(jsonResponse([githubIssue(101)]));
    vi.stubGlobal("fetch", fetchMock);

    const issues = await listRepositoryIssues();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("page=2");
    expect(issues).toHaveLength(101);
  });
});

describe("startIssueSession guard", () => {
  it("rejects closed issues instead of requiring TRACKED_ISSUES membership", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.github.com")) {
        return jsonResponse(githubIssue(9, { state: "closed" }));
      }
      if (url.includes("/sessions")) {
        return jsonResponse({
          items: [],
          end_cursor: null,
          has_next_page: false,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startIssueSession(9)).rejects.toThrow(
      "Issue #9 is closed and cannot be remediated",
    );
  });

  it("rejects pull request numbers", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.github.com")) {
        return jsonResponse(
          githubIssue(12, { pull_request: { url: "https://example.com" } }),
        );
      }
      return jsonResponse({ items: [], end_cursor: null, has_next_page: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startIssueSession(12)).rejects.toThrow(
      "#12 is a pull request, not an issue",
    );
  });
});
