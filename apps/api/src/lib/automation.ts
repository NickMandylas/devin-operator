import type {
  AutomationOverview,
  DevinSession,
  Issue,
} from "@superset-devin/contracts";
import {
  AUTOMATION_LABELS,
  getConfig,
  getRepositoryConfigs,
  getRuntimeReadiness,
} from "./config";
import {
  archiveDevinSession,
  createDevinSession,
  getDevinSession,
  listDevinSessions,
  sendDevinMessage,
  terminateDevinSession,
} from "./devin-client";
import {
  addIssueLabels,
  ensureAutomationLabels,
  getIssue,
  listTrackedIssues,
  removeIssueLabel,
  replaceAutomationStateLabels,
  upsertStatusComment,
} from "./github-client";
import { buildRemediationPrompt, issueTag, repositoryTag } from "./prompt";

export const AUTOMATION_TAG = "remediation-control-plane";
const LEGACY_AUTOMATION_TAG = "superset-remediation";

function isActive(session: DevinSession): boolean {
  return (
    ["new", "claimed", "running", "resuming"].includes(session.status) &&
    session.statusDetail !== "finished"
  );
}

export function findIssueSession(
  repository: string,
  issueNumber: number,
  sessions: DevinSession[],
): DevinSession | undefined {
  const selectedRepositoryTag = repositoryTag(repository);
  const defaultRepository = getRepositoryConfigs()[0].repository;

  return sessions
    .filter((session) => {
      const belongsToAutomation = session.tags.some((tag) =>
        [AUTOMATION_TAG, LEGACY_AUTOMATION_TAG].includes(tag),
      );
      const taggedRepositories = session.tags.filter((tag) =>
        tag.startsWith("github-repo-"),
      );
      const belongsToRepository =
        session.tags.includes(selectedRepositoryTag) ||
        (taggedRepositories.length === 0 && repository === defaultRepository);

      return (
        belongsToAutomation &&
        belongsToRepository &&
        session.tags.includes(issueTag(issueNumber))
      );
    })
    .sort((left, right) =>
      (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
    )[0];
}

function labelsForSession(session: DevinSession): string[] {
  if (session.pullRequests.length > 0)
    return [AUTOMATION_LABELS.pullRequest.name];
  if (
    session.statusDetail === "waiting_for_user" ||
    session.statusDetail === "waiting_for_approval"
  ) {
    return [AUTOMATION_LABELS.needsInput.name];
  }
  if (session.status === "error") return [AUTOMATION_LABELS.failed.name];
  if (session.status === "suspended" && session.statusDetail !== "inactivity") {
    return [AUTOMATION_LABELS.failed.name];
  }
  if (session.status === "exit" || session.statusDetail === "finished") {
    return [AUTOMATION_LABELS.complete.name];
  }
  return [AUTOMATION_LABELS.running.name];
}

function statusComment(issue: Issue, session: DevinSession): string {
  const pullRequests = session.pullRequests.length
    ? session.pullRequests
        .map(
          (pullRequest) =>
            `- [${pullRequest.title ?? "Pull request"}](${pullRequest.url})`,
        )
        .join("\n")
    : "- Not opened yet";

  return `## Devin remediation status

| Field | Value |
| --- | --- |
| Issue | #${issue.number} |
| Session | [${session.sessionId}](${session.url}) |
| Status | \`${session.status}${session.statusDetail ? ` / ${session.statusDetail}` : ""}\` |
| ACUs consumed | ${session.acusConsumed.toFixed(2)} |
| Last update | ${session.updatedAt ?? "Pending"} |

### Pull requests

${pullRequests}

This comment is maintained by the remediation control plane.`;
}

async function syncSessionToGitHub(
  repository: string,
  issue: Issue,
  session: DevinSession,
): Promise<void> {
  await replaceAutomationStateLabels(
    issue.number,
    labelsForSession(session),
    repository,
  );
  await upsertStatusComment(
    issue.number,
    statusComment(issue, session),
    repository,
  );
}

export async function getAutomationOverview(
  repository?: string,
): Promise<AutomationOverview> {
  const config = getConfig(repository);
  const [issues, sessions] = await Promise.all([
    listTrackedIssues(config.repository),
    getRuntimeReadiness().devinConfigured
      ? listDevinSessions()
      : Promise.resolve([]),
  ]);
  const issueRuns = issues.map((issue) => ({
    issue,
    session:
      findIssueSession(config.repository, issue.number, sessions) ?? null,
  }));

  return {
    repository: config.repository,
    service: getRuntimeReadiness(),
    issueRuns,
    metrics: {
      trackedIssues: issueRuns.length,
      activeSessions: issueRuns.filter(
        (run) => run.session && isActive(run.session),
      ).length,
      needsInput: issueRuns.filter((run) =>
        ["waiting_for_user", "waiting_for_approval"].includes(
          run.session?.statusDetail ?? "",
        ),
      ).length,
      pullRequests: issueRuns.reduce(
        (total, run) => total + (run.session?.pullRequests.length ?? 0),
        0,
      ),
    },
    refreshedAt: new Date().toISOString(),
  };
}

export async function startIssueSession(
  issueNumber: number,
  options: { force?: boolean; maxAcuLimit?: number } = {},
  repository?: string,
): Promise<DevinSession> {
  const config = getConfig(repository);

  // Issues are discovered dynamically; getIssue rejects pull request numbers,
  // and closed issues are rejected here so automation only targets open work.
  const [issue, sessions] = await Promise.all([
    getIssue(issueNumber, config.repository),
    listDevinSessions(),
  ]);
  if (issue.state !== "open") {
    throw new Error(`Issue #${issueNumber} is closed and cannot be remediated`);
  }

  const existing = findIssueSession(config.repository, issueNumber, sessions);
  if (existing && !existing.isArchived && !options.force) return existing;

  const session = await createDevinSession({
    prompt: buildRemediationPrompt(issue, config.repository),
    repository: config.repository,
    title: `${config.repo} #${issue.number}: ${issue.title}`.slice(0, 120),
    tags: [
      AUTOMATION_TAG,
      repositoryTag(config.repository),
      issueTag(issue.number),
      issue.category,
    ],
    maxAcuLimit: options.maxAcuLimit ?? config.devinMaxAcuLimit,
  });

  if (config.githubToken) {
    // GitHub sync is best-effort: the session is already running, so a
    // transient GitHub failure must not fail the launch. The scheduled
    // reconciliation will converge labels and comments.
    try {
      await ensureAutomationLabels(config.repository);
      await removeIssueLabel(
        issue.number,
        AUTOMATION_LABELS.ready.name,
        config.repository,
      );
      await addIssueLabels(
        issue.number,
        [AUTOMATION_LABELS.running.name],
        config.repository,
      );
      await upsertStatusComment(
        issue.number,
        statusComment(issue, session),
        config.repository,
      );
    } catch (error) {
      console.warn(
        `[automation] Session ${session.sessionId} started for #${issue.number} but GitHub sync failed; reconciliation will retry.`,
        error,
      );
    }
  }

  return session;
}

export async function messageIssueSession(
  sessionId: string,
  message: string,
): Promise<void> {
  await sendDevinMessage(sessionId, message);
}

export async function archiveIssueSession(sessionId: string): Promise<void> {
  await archiveDevinSession(sessionId);
}

export async function terminateIssueSession(sessionId: string): Promise<void> {
  await terminateDevinSession(sessionId);
}

export async function reconcileSessions(repository?: string): Promise<{
  ok: boolean;
  checked: number;
  updated: number;
  errors: string[];
}> {
  const readiness = getRuntimeReadiness();
  if (!readiness.devinConfigured)
    throw new Error("Devin API credentials are not configured");
  if (!readiness.githubWriteConfigured)
    throw new Error("GITHUB_TOKEN is not configured");

  const repositories = repository
    ? [getConfig(repository)]
    : getRepositoryConfigs();
  const sessions = await listDevinSessions();
  let checked = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const config of repositories) {
    const issues = await listTrackedIssues(config.repository);
    checked += issues.length;

    for (const issue of issues) {
      const session = findIssueSession(
        config.repository,
        issue.number,
        sessions,
      );
      // Archived sessions are treated as "ready to launch" by the dashboard;
      // re-syncing them would resurrect stale labels and status comments.
      if (!session || session.isArchived) continue;
      try {
        const current = isActive(session)
          ? await getDevinSession(session.sessionId)
          : session;
        await syncSessionToGitHub(config.repository, issue, current);
        updated += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown reconciliation error";
        errors.push(`${config.repository}#${issue.number}: ${message}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    checked,
    updated,
    errors,
  };
}

export { ensureAutomationLabels, getDevinSession, listDevinSessions };
