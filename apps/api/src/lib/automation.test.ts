import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevinSession, Issue } from "@superset-devin/contracts";

vi.mock("./devin-client", () => ({
  archiveDevinSession: vi.fn(),
  createDevinSession: vi.fn(),
  getDevinSession: vi.fn(),
  listDevinSessions: vi.fn(),
  sendDevinMessage: vi.fn(),
  terminateDevinSession: vi.fn(),
}));

vi.mock("./github-client", () => ({
  addIssueLabels: vi.fn(),
  ensureAutomationLabels: vi.fn(),
  getIssue: vi.fn(),
  listTrackedIssues: vi.fn(),
  removeIssueLabel: vi.fn(),
  replaceAutomationStateLabels: vi.fn(),
  upsertStatusComment: vi.fn(),
}));

import { reconcileSessions } from "./automation";
import { getDevinSession, listDevinSessions } from "./devin-client";
import {
  listTrackedIssues,
  replaceAutomationStateLabels,
  upsertStatusComment,
} from "./github-client";

const REPOSITORY = "NickMandylas/superset";

const originalEnv = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  DEVIN_API_TOKEN: process.env.DEVIN_API_TOKEN,
  DEVIN_ORG_ID: process.env.DEVIN_ORG_ID,
};

function issue(number: number): Issue {
  return {
    number,
    title: `Issue ${number}`,
    body: "",
    url: `https://github.com/${REPOSITORY}/issues/${number}`,
    state: "open",
    labels: [],
    category: "vulnerability",
  };
}

function session(overrides: Partial<DevinSession> = {}): DevinSession {
  return {
    sessionId: "devin-abc",
    title: "superset #2",
    url: "https://app.devin.ai/sessions/devin-abc",
    status: "exit",
    statusDetail: "finished",
    acusConsumed: 1,
    isArchived: false,
    tags: [
      "remediation-control-plane",
      "github-repo-nickmandylas-superset",
      "github-issue-2",
    ],
    pullRequests: [],
    structuredOutput: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: null,
    ...overrides,
  };
}

describe("reconcileSessions", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
    process.env.DEVIN_API_TOKEN = "test-devin-token";
    process.env.DEVIN_ORG_ID = "org-test";
    vi.mocked(listTrackedIssues).mockResolvedValue([issue(2)]);
    vi.mocked(getDevinSession).mockImplementation(async () => session());
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.clearAllMocks();
  });

  it("skips archived sessions instead of resurrecting labels and comments", async () => {
    vi.mocked(listDevinSessions).mockResolvedValue([
      session({ isArchived: true }),
    ]);

    const result = await reconcileSessions(REPOSITORY);

    expect(result).toMatchObject({ ok: true, checked: 1, updated: 0 });
    expect(replaceAutomationStateLabels).not.toHaveBeenCalled();
    expect(upsertStatusComment).not.toHaveBeenCalled();
  });

  it("still syncs labels and comments for non-archived sessions", async () => {
    vi.mocked(listDevinSessions).mockResolvedValue([session()]);

    const result = await reconcileSessions(REPOSITORY);

    expect(result).toMatchObject({ ok: true, checked: 1, updated: 1 });
    expect(replaceAutomationStateLabels).toHaveBeenCalledTimes(1);
    expect(upsertStatusComment).toHaveBeenCalledTimes(1);
  });
});
