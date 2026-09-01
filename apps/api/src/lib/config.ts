export const AUTOMATION_LABELS = {
  ready: {
    name: "devin-ready",
    color: "d89b33",
    description: "Ready for automated remediation",
  },
  running: {
    name: "devin-running",
    color: "2f81f7",
    description: "Devin session is active",
  },
  needsInput: {
    name: "devin-needs-input",
    color: "bf8700",
    description: "Devin needs a human response",
  },
  pullRequest: {
    name: "devin-pr-open",
    color: "8250df",
    description: "Devin opened a pull request",
  },
  failed: {
    name: "devin-failed",
    color: "cf222e",
    description: "Automated remediation failed",
  },
  complete: {
    name: "devin-complete",
    color: "1a7f37",
    description: "Automated remediation completed",
  },
} as const;

// Deliberately kept out of AUTOMATION_LABELS: state reconciliation strips
// AUTOMATION_LABELS entries from issues, but the scan label must persist so
// scan-created issues stay discoverable and deduplicated across runs.
export const DEPENDENCY_SCAN_LABEL = {
  name: "devin-scan",
  color: "0e8a16",
  description: "Created by the daily dependency vulnerability scan",
} as const;

const DEFAULT_REPOSITORY = "NickMandylas/superset";
const DEFAULT_ISSUES = [1, 2, 3, 4];

export interface RepositoryConfig {
  repository: string;
  owner: string;
  repo: string;
  trackedIssues: number[];
}

function parseIssueNumbers(value: string | undefined): number[] {
  if (!value) return DEFAULT_ISSUES;

  const numbers = value
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isInteger(entry) && entry > 0);

  return numbers.length > 0 ? [...new Set(numbers)] : DEFAULT_ISSUES;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createRepositoryConfig(
  repository: string,
  trackedIssues: number[],
): RepositoryConfig {
  const [owner, repo] = repository.split("/");

  if (!owner || !repo || repository.split("/").length !== 2) {
    throw new Error(
      `Repository ${repository} must use the owner/repository format`,
    );
  }

  return { repository, owner, repo, trackedIssues };
}

export function getRepositoryConfigs(): RepositoryConfig[] {
  const configured = process.env.GITHUB_REPOSITORIES?.trim();

  if (configured) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configured);
    } catch {
      throw new Error("GITHUB_REPOSITORIES must be a valid JSON array");
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(
        "GITHUB_REPOSITORIES must contain at least one repository",
      );
    }

    const repositories = parsed.map((entry) => {
      if (!entry || typeof entry !== "object") {
        throw new Error("Each GITHUB_REPOSITORIES entry must be an object");
      }
      const candidate = entry as {
        repository?: unknown;
        trackedIssues?: unknown;
      };
      if (typeof candidate.repository !== "string") {
        throw new Error("Each GITHUB_REPOSITORIES entry requires a repository");
      }
      const issueValue = Array.isArray(candidate.trackedIssues)
        ? candidate.trackedIssues.join(",")
        : undefined;
      return createRepositoryConfig(
        candidate.repository.trim(),
        parseIssueNumbers(issueValue),
      );
    });

    if (
      new Set(repositories.map((entry) => entry.repository)).size !==
      repositories.length
    ) {
      throw new Error("GITHUB_REPOSITORIES contains duplicate repositories");
    }

    return repositories;
  }

  return [
    createRepositoryConfig(
      process.env.GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY,
      parseIssueNumbers(process.env.TRACKED_ISSUES),
    ),
  ];
}

export function getRepositoryConfig(repository?: string): RepositoryConfig {
  const repositories = getRepositoryConfigs();
  if (!repository) return repositories[0];

  const selected = repositories.find(
    (entry) => entry.repository === repository,
  );
  if (!selected) throw new Error(`Repository ${repository} is not configured`);
  return selected;
}

export function getConfig(repository?: string) {
  const selectedRepository = getRepositoryConfig(repository);

  return {
    ...selectedRepository,
    githubToken: process.env.GITHUB_TOKEN?.trim(),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET?.trim(),
    cronSecret: process.env.CRON_SECRET?.trim(),
    controlPlaneToken: process.env.CONTROL_PLANE_TOKEN?.trim(),
    devinApiToken: process.env.DEVIN_API_TOKEN?.trim(),
    devinOrgId: process.env.DEVIN_ORG_ID?.trim(),
    devinBaseUrl: (
      process.env.DEVIN_BASE_URL?.trim() || "https://api.devin.ai/v3"
    ).replace(/\/$/, ""),
    devinMaxAcuLimit: parsePositiveInteger(process.env.DEVIN_MAX_ACU_LIMIT, 25),
  };
}

export function getRuntimeReadiness() {
  const config = getConfig();

  return {
    devinConfigured: Boolean(config.devinApiToken && config.devinOrgId),
    githubWriteConfigured: Boolean(config.githubToken),
    webhookConfigured: Boolean(config.webhookSecret && config.githubToken),
    cronConfigured: Boolean(config.cronSecret),
    controlPlaneProtected: Boolean(config.controlPlaneToken),
  };
}

export function requireDevinConfig() {
  const config = getConfig();
  if (!config.devinApiToken || !config.devinOrgId) {
    throw new Error(
      "DEVIN_API_TOKEN and DEVIN_ORG_ID are required for this operation",
    );
  }

  return {
    ...config,
    devinApiToken: config.devinApiToken,
    devinOrgId: config.devinOrgId,
  };
}

export function requireGitHubWriteConfig(repository?: string) {
  const config = getConfig(repository);
  if (!config.githubToken) {
    throw new Error("GITHUB_TOKEN is required for GitHub write operations");
  }

  return { ...config, githubToken: config.githubToken };
}
