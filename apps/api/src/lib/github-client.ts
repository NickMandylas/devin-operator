import type { Issue, IssueCategory } from "@superset-devin/contracts";
import { z } from "zod";
import {
  AUTOMATION_LABELS,
  getConfig,
  requireGitHubWriteConfig,
} from "./config";

const GitHubLabelSchema = z.union([z.string(), z.object({ name: z.string() })]);
const GitHubIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.url(),
  state: z.enum(["open", "closed"]),
  labels: z.array(GitHubLabelSchema),
  pull_request: z.unknown().optional(),
});

const GitHubCommentSchema = z.object({
  id: z.number(),
  body: z.string().nullable(),
});

const GitHubPermissionSchema = z.object({
  permission: z.enum(["admin", "maintain", "write", "triage", "read", "none"]),
});

const STATUS_COMMENT_MARKER = "<!-- devin-remediation-status -->";

export function inferIssueCategory(
  issue: Pick<Issue, "number" | "title" | "labels">,
): IssueCategory {
  const search = `${issue.title} ${issue.labels.join(" ")}`.toLowerCase();
  if (issue.number === 1 || /upgrade|dependency|flask/.test(search))
    return "dependency";
  if (/vulnerab|security|cve|xss|csrf/.test(search)) return "vulnerability";
  if (/ui|hover|dropdown|visual|frontend/.test(search)) return "ui";
  return "code-quality";
}

function mapIssue(raw: z.infer<typeof GitHubIssueSchema>): Issue {
  const labels = raw.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
  const issue = {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    url: raw.html_url,
    state: raw.state,
    labels,
  };

  return { ...issue, category: inferIssueCategory(issue) };
}

async function githubRequest(
  path: string,
  init?: RequestInit,
  write = false,
  repository?: string,
): Promise<unknown> {
  const config = write
    ? requireGitHubWriteConfig(repository)
    : getConfig(repository);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "superset-devin-automation",
          ...(config.githubToken
            ? { Authorization: `Bearer ${config.githubToken}` }
            : {}),
          ...init?.headers,
        },
      });

      const body = await response.text();
      if (response.ok) return body ? JSON.parse(body) : null;

      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 403 && /rate limit/i.test(body));
      if (retryable && attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 300 * 2 ** attempt),
        );
        continue;
      }

      throw new Error(
        `GitHub API returned ${response.status}: ${body.slice(0, 500)}`,
      );
    } catch (error) {
      lastError = error;
      const isNetworkError =
        error instanceof TypeError || error instanceof DOMException;
      if (!isNetworkError || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("GitHub API request failed");
}

function repositoryPath(repository?: string): string {
  const { owner, repo } = getConfig(repository);
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export async function listRepositoryIssues(
  repository?: string,
): Promise<Issue[]> {
  const issues: Issue[] = [];
  let page = 1;

  for (;;) {
    const raw = z
      .array(GitHubIssueSchema)
      .parse(
        await githubRequest(
          `${repositoryPath(repository)}/issues?state=open&per_page=100&page=${page}`,
          undefined,
          false,
          repository,
        ),
      );
    issues.push(
      ...raw
        .filter((entry) => entry.pull_request === undefined)
        .map(mapIssue),
    );
    if (raw.length < 100) break;
    page += 1;
  }

  return issues.sort((a, b) => a.number - b.number);
}

export async function listTrackedIssues(repository?: string): Promise<Issue[]> {
  // Issues are discovered dynamically so new issues (e.g. scanner-filed ones)
  // appear without editing TRACKED_ISSUES.
  return listRepositoryIssues(repository);
}

export async function getIssue(
  issueNumber: number,
  repository?: string,
): Promise<Issue> {
  const raw = GitHubIssueSchema.parse(
    await githubRequest(
      `${repositoryPath(repository)}/issues/${issueNumber}`,
      undefined,
      false,
      repository,
    ),
  );
  if (raw.pull_request !== undefined)
    throw new Error(`#${issueNumber} is a pull request, not an issue`);
  return mapIssue(raw);
}

const GitHubRepoLabelSchema = z.object({
  name: z.string(),
  color: z.string(),
  description: z.string().nullable(),
});

interface AutomationLabel {
  name: string;
  color: string;
  description: string;
}

async function updateLabel(
  label: AutomationLabel,
  repository?: string,
): Promise<void> {
  await githubRequest(
    `${repositoryPath(repository)}/labels/${encodeURIComponent(label.name)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        new_name: label.name,
        color: label.color,
        description: label.description,
      }),
    },
    true,
    repository,
  );
}

export async function ensureAutomationLabels(
  repository?: string,
): Promise<void> {
  const existingLabels = z
    .array(GitHubRepoLabelSchema)
    .parse(
      await githubRequest(
        `${repositoryPath(repository)}/labels?per_page=100`,
        undefined,
        true,
        repository,
      ),
    );
  const existingByName = new Map(
    existingLabels.map((label) => [label.name.toLowerCase(), label]),
  );

  for (const label of Object.values(AUTOMATION_LABELS)) {
    const existing = existingByName.get(label.name.toLowerCase());

    if (!existing) {
      await githubRequest(
        `${repositoryPath(repository)}/labels`,
        { method: "POST", body: JSON.stringify(label) },
        true,
        repository,
      ).catch(async (error: unknown) => {
        // Another writer may have created the label between our list and
        // this create (422 already_exists) — converge via update instead.
        if (
          !(error instanceof Error) ||
          !error.message.includes("already_exists")
        )
          throw error;
        await updateLabel(label, repository);
      });
      continue;
    }

    const matches =
      existing.color.toLowerCase() === label.color.toLowerCase() &&
      (existing.description ?? "") === label.description;
    if (!matches) await updateLabel(label, repository);
  }
}

export async function addIssueLabels(
  issueNumber: number,
  labels: string[],
  repository?: string,
): Promise<void> {
  await githubRequest(
    `${repositoryPath(repository)}/issues/${issueNumber}/labels`,
    { method: "POST", body: JSON.stringify({ labels }) },
    true,
    repository,
  );
}

export async function removeIssueLabel(
  issueNumber: number,
  label: string,
  repository?: string,
): Promise<void> {
  await githubRequest(
    `${repositoryPath(repository)}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
    { method: "DELETE" },
    true,
    repository,
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("404")) return;
    throw error;
  });
}

export async function replaceAutomationStateLabels(
  issueNumber: number,
  labelsToAdd: string[],
  repository?: string,
): Promise<void> {
  const stateLabels = Object.values(AUTOMATION_LABELS)
    .filter((label) => label.name !== AUTOMATION_LABELS.ready.name)
    .map((label) => label.name);

  await Promise.all(
    stateLabels.map((label) =>
      removeIssueLabel(issueNumber, label, repository),
    ),
  );
  if (labelsToAdd.length > 0)
    await addIssueLabels(issueNumber, labelsToAdd, repository);
}

export async function upsertStatusComment(
  issueNumber: number,
  markdown: string,
  repository?: string,
): Promise<void> {
  const comments = z
    .array(GitHubCommentSchema)
    .parse(
      await githubRequest(
        `${repositoryPath(repository)}/issues/${issueNumber}/comments?per_page=100`,
        undefined,
        false,
        repository,
      ),
    );
  const existing = comments.find((comment) =>
    comment.body?.includes(STATUS_COMMENT_MARKER),
  );
  const body = `${STATUS_COMMENT_MARKER}\n${markdown}`;

  if (existing) {
    await githubRequest(
      `${repositoryPath(repository)}/issues/comments/${existing.id}`,
      { method: "PATCH", body: JSON.stringify({ body }) },
      true,
      repository,
    );
    return;
  }

  await githubRequest(
    `${repositoryPath(repository)}/issues/${issueNumber}/comments`,
    { method: "POST", body: JSON.stringify({ body }) },
    true,
    repository,
  );
}

export async function hasWritePermission(
  username: string,
  repository?: string,
): Promise<boolean> {
  const permission = GitHubPermissionSchema.parse(
    await githubRequest(
      `${repositoryPath(repository)}/collaborators/${encodeURIComponent(username)}/permission`,
      undefined,
      true,
      repository,
    ),
  );
  return ["admin", "maintain", "write"].includes(permission.permission);
}
