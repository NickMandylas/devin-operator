import { afterEach, describe, expect, it } from "vitest";
import type { DevinSession } from "@superset-devin/contracts";
import { findIssueSession } from "./automation";
import {
  buildDependencyScanPrompt,
  DEPENDENCY_SCAN_TAG,
  repositoryTag,
} from "./prompt";
import {
  findReusableScanSession,
  findScanSchedule,
  SCAN_REUSE_WINDOW_HOURS,
  scanScheduleName,
} from "./scanner";
import type { DevinSchedule } from "./devin-client";

const REPOSITORY = "NickMandylas/superset";
const NOW = Date.parse("2026-09-01T12:00:00.000Z");

const originalRepositories = process.env.GITHUB_REPOSITORIES;

afterEach(() => {
  if (originalRepositories === undefined) {
    delete process.env.GITHUB_REPOSITORIES;
  } else {
    process.env.GITHUB_REPOSITORIES = originalRepositories;
  }
});

function scanSession(overrides: Partial<DevinSession> = {}): DevinSession {
  return {
    sessionId: "devin-scan-1",
    title: "superset: daily dependency vulnerability scan",
    url: "https://app.devin.ai/sessions/devin-scan-1",
    status: "exit",
    statusDetail: "finished",
    acusConsumed: 2,
    isArchived: false,
    tags: [
      "remediation-control-plane",
      repositoryTag(REPOSITORY),
      DEPENDENCY_SCAN_TAG,
    ],
    pullRequests: [],
    structuredOutput: null,
    createdAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
    updatedAt: null,
    ...overrides,
  };
}

describe("buildDependencyScanPrompt", () => {
  it("instructs Devin to audit manifests and file devin-scan issues", () => {
    const prompt = buildDependencyScanPrompt(REPOSITORY);

    expect(prompt).toContain(REPOSITORY);
    expect(prompt).toContain("requirements/base.txt");
    expect(prompt).toContain("superset-frontend/package.json");
    expect(prompt).toContain("OSV.dev");
    expect(prompt).toContain("devin-scan");
    expect(prompt).toContain(
      '"[scan] <package> <version> has known vulnerabilities (<worst advisory id>)"',
    );
    expect(prompt).toContain("at most 5 new issues");
    expect(prompt).toContain("Do not add the devin-ready label");
    expect(prompt).toContain(
      "Do not modify code, open pull requests, or upgrade dependencies",
    );
  });
});

describe("findReusableScanSession", () => {
  it("reuses an active scan session", () => {
    const active = scanSession({ status: "running", statusDetail: null });
    expect(findReusableScanSession(REPOSITORY, [active], NOW)).toBe(active);
  });

  it("reuses a finished scan session created inside the reuse window", () => {
    const recent = scanSession();
    expect(findReusableScanSession(REPOSITORY, [recent], NOW)).toBe(recent);
  });

  it("relaunches after the reuse window has passed", () => {
    const stale = scanSession({
      createdAt: new Date(
        NOW - (SCAN_REUSE_WINDOW_HOURS + 1) * 60 * 60 * 1000,
      ).toISOString(),
    });
    expect(findReusableScanSession(REPOSITORY, [stale], NOW)).toBeUndefined();
  });

  it("ignores archived sessions, other repositories, and remediation sessions", () => {
    const archived = scanSession({ isArchived: true });
    const otherRepository = scanSession({
      tags: [
        "remediation-control-plane",
        repositoryTag("example/other"),
        DEPENDENCY_SCAN_TAG,
      ],
    });
    const remediation = scanSession({
      tags: [
        "remediation-control-plane",
        repositoryTag(REPOSITORY),
        "github-issue-1",
        "dependency",
      ],
    });

    expect(
      findReusableScanSession(
        REPOSITORY,
        [archived, otherRepository, remediation],
        NOW,
      ),
    ).toBeUndefined();
  });

  it("prefers the newest matching scan session", () => {
    const older = scanSession({
      sessionId: "devin-scan-old",
      createdAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
    });
    const newer = scanSession({ sessionId: "devin-scan-new" });

    expect(
      findReusableScanSession(REPOSITORY, [older, newer], NOW)?.sessionId,
    ).toBe("devin-scan-new");
  });
});

describe("scan session isolation", () => {
  it("is never matched by findIssueSession because it has no issue tag", () => {
    process.env.GITHUB_REPOSITORIES = JSON.stringify([
      { repository: REPOSITORY, trackedIssues: [1, 2, 3, 4] },
    ]);

    expect(
      findIssueSession(REPOSITORY, 1, [
        scanSession({ status: "running", statusDetail: null }),
      ]),
    ).toBeUndefined();
  });
});

function schedule(overrides: Partial<DevinSchedule> = {}): DevinSchedule {
  return {
    scheduleId: "sched-1",
    name: scanScheduleName(REPOSITORY),
    prompt: "prompt",
    frequency: "0 2 * * *",
    scheduleType: "recurring",
    enabled: true,
    tags: [
      "remediation-control-plane",
      repositoryTag(REPOSITORY),
      DEPENDENCY_SCAN_TAG,
    ],
    lastExecutedAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("findScanSchedule", () => {
  it("matches by dependency-scan and repository tags", () => {
    const tagged = schedule({ name: "renamed by an operator" });
    expect(findScanSchedule(REPOSITORY, [tagged])).toBe(tagged);
  });

  it("falls back to the canonical name when tags are missing", () => {
    const named = schedule({ tags: [] });
    expect(findScanSchedule(REPOSITORY, [named])).toBe(named);
  });

  it("ignores schedules for other repositories", () => {
    const other = schedule({
      name: scanScheduleName("example/other"),
      tags: [
        "remediation-control-plane",
        repositoryTag("example/other"),
        DEPENDENCY_SCAN_TAG,
      ],
    });
    expect(findScanSchedule(REPOSITORY, [other])).toBeUndefined();
  });
});
