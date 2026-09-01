import type { Issue } from "@superset-devin/contracts";
import { DEPENDENCY_SCAN_LABEL } from "./config";

export function issueTag(issueNumber: number): string {
  return `github-issue-${issueNumber}`;
}

export function repositoryTag(repository: string): string {
  return `github-repo-${repository.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export const DEPENDENCY_SCAN_TAG = "dependency-scan";

function validationRequirements(issue: Issue): string[] {
  const common = [
    "Run the smallest relevant lint, typecheck, and test suites for every file you change.",
    "Do not merge the pull request or change unrelated code.",
    "Document commands run and their results in the pull request description.",
  ];

  if (issue.category === "ui") {
    return [
      ...common,
      "Start the application locally and verify the affected workflow in a real browser.",
      "Attach before and after screenshots to the pull request. Include a short recording when motion or interaction state matters.",
      "Check keyboard access, focus visibility, hover state, and a narrow viewport.",
    ];
  }

  if (issue.category === "vulnerability") {
    return [
      ...common,
      "Add a regression test that fails before the security fix and passes afterward.",
      "Do not include exploit details, secrets, or sensitive runtime data in public logs.",
    ];
  }

  return common;
}

export function buildRemediationPrompt(
  issue: Issue,
  repository: string,
): string {
  const branchName = `devin/issue-${issue.number}`;
  const requirements = validationRequirements(issue)
    .map((item) => `- ${item}`)
    .join("\n");

  return `You are remediating GitHub issue #${issue.number} in ${repository}.

Issue title: ${issue.title}
Issue URL: ${issue.url}
Category: ${issue.category}

Issue description:
${issue.body}

Workflow requirements:
- Read the repository contribution guidance before editing.
- Reproduce or verify the issue first.
- Use the branch ${branchName}. If it already exists, continue it safely.
- Keep the change focused on issue #${issue.number}.
${requirements}
- Commit the implementation and push the branch.
- Open a pull request against the fork's default branch with \"Fixes #${issue.number}\" in the description.
- Return structured output with a concise summary, tests run, pull request URL, and UI evidence URLs.

If blocked, stop before guessing and clearly state the exact decision, permission, or credential needed.`;
}

export function buildDependencyScanPrompt(repository: string): string {
  const label = DEPENDENCY_SCAN_LABEL.name;

  return `You are running the scheduled dependency vulnerability scan for ${repository}.

Scan scope:
- Inspect every dependency manifest that exists in the repository, including requirements.txt, requirements/base.txt, package.json, and superset-frontend/package.json.
- Identify pinned dependencies with known vulnerabilities using trusted sources such as OSV.dev, pip-audit, npm audit, or GitHub security advisories.
- Do not modify code, open pull requests, or upgrade dependencies in this session. This session only reports findings.

For each vulnerable dependency:
- First search the repository's open issues labeled ${label}. If an issue for that package already exists, update its title and body instead of creating a duplicate.
- Otherwise create a GitHub issue titled "[scan] <package> <version> has known vulnerabilities (<worst advisory id>)".
- Label the issue ${label} (create the label with color ${DEPENDENCY_SCAN_LABEL.color} if it is missing). Do not add the devin-ready label; a human promotes scan issues to remediation.
- The issue body must state the manifest that pins the package and list each advisory as an OSV.dev or GHSA link with its severity and a one-line summary.
- Create at most 5 new issues in this run. If there are more findings, mention the remaining packages in your final summary instead of filing more issues.

Return structured output where:
- summary describes the manifests scanned, packages checked, vulnerable packages found, and issues created or updated.
- tests lists the audit commands or data sources you used.
- pull_request_url is null.
- ui_evidence contains the URLs of the GitHub issues you created or updated.

If blocked, stop before guessing and clearly state the exact decision, permission, or credential needed.`;
}
