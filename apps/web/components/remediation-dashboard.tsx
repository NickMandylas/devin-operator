"use client"

import type {
  AutomationOverview,
  IssueCategory,
  ScanScheduleState,
  ServiceReadiness,
} from "@superset-devin/contracts"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  ActivityIcon,
  CalendarClockIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  MessageSquareIcon,
  PlayIcon,
  SettingsIcon,
  ShieldAlertIcon,
  TagsIcon,
  TriangleAlertIcon,
  WebhookIcon,
} from "lucide-react"

import { AutomationHealth } from "@/components/automation-health"
import { IssuesTable } from "@/components/issues-table"
import { SectionCards } from "@/components/section-cards"
import { SiteHeader } from "@/components/site-header"
import { useWorkspace } from "@/components/workspace-provider"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { api } from "@/lib/orpc"
import { formatDate } from "@/lib/sessions"
import { cn } from "@/lib/utils"

export type RemediationView =
  | "overview"
  | "issues"
  | "sessions"
  | "pull-requests"
  | "automations"
  | "configuration"

const PAGE_COPY: Record<
  RemediationView,
  { title: string; description: string }
> = {
  overview: {
    title: "Workspace overview",
    description: "Monitor repository health and automation readiness.",
  },
  issues: {
    title: "Tracked issues",
    description: "Review the remediation queue and launch focused work.",
  },
  sessions: {
    title: "Devin sessions",
    description: "Inspect active and completed remediation runs.",
  },
  "pull-requests": {
    title: "Pull requests",
    description: "Review the observable outputs produced by Devin.",
  },
  automations: {
    title: "Automations",
    description: "Event triggers and scheduled Devin jobs for the workspace.",
  },
  configuration: {
    title: "Configuration",
    description: "Check integrations and repository automation settings.",
  },
}

const LOCAL_ISSUES: Record<string, Array<[number, string, IssueCategory]>> = {
  "NickMandylas/superset": [
    [1, "Upgrade Flask from 2.3.3 to 3.1.3", "dependency"],
    [
      2,
      "Remove unused Deck.gl 3D dependencies that pull vulnerable image-size",
      "vulnerability",
    ],
    [
      3,
      "Restore hover styles in SQL Lab and the Change Datasource modal",
      "ui",
    ],
    [
      4,
      "Modernize the AG Grid time-comparison dropdown and add focused tests",
      "ui",
    ],
  ],
}

function createFallbackOverview(
  repository: string,
  trackedIssues: number,
  service: ServiceReadiness
): AutomationOverview {
  const issues = LOCAL_ISSUES[repository] ?? []

  return {
    repository,
    service,
    issueRuns: issues.map(([number, title, category]) => ({
      issue: {
        number,
        title,
        body: "",
        url: `https://github.com/${repository}/issues/${number}`,
        state: "open" as const,
        labels: [],
        category,
      },
      session: null,
    })),
    metrics: {
      trackedIssues,
      activeSessions: 0,
      needsInput: 0,
      pullRequests: 0,
    },
    refreshedAt: "",
  }
}

function QueueSkeleton() {
  return (
    <div className="divide-y overflow-hidden rounded-lg border">
      {[0, 1, 2, 3].map((item) => (
        <div className="flex items-center gap-3 p-4" key={item}>
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  )
}

function describeScanCadence(schedule: ScanScheduleState | null): string {
  if (!schedule) return "Checking Devin schedule…"
  if (!schedule.exists) return "Not scheduled yet"
  const cadence =
    schedule.frequency === "0 2 * * *"
      ? "Daily 02:00 UTC"
      : (schedule.frequency ?? "Recurring")
  const suffix = schedule.enabled === false ? " (paused)" : ""
  return `${cadence} · scheduled in Devin${suffix}`
}

export function RemediationDashboard({ view }: { view: RemediationView }) {
  const { selectedRepository, service } = useWorkspace()
  const [overview, setOverview] = useState<AutomationOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>("loading")
  const [scanSchedule, setScanSchedule] = useState<ScanScheduleState | null>(
    null
  )
  const repository = selectedRepository.repository

  const loadOverview = useCallback(
    async (quiet = false): Promise<boolean> => {
      if (!quiet) {
        setBusyKey("loading")
        setOverview(null)
      }
      setError(null)
      try {
        setOverview(await api.automation.overview({ repository }))
        return true
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the automation service"
        setError(
          message === "Internal Server Error"
            ? "GitHub did not return live issue data."
            : message
        )
        return false
      } finally {
        if (!quiet) setBusyKey(null)
      }
    },
    [repository]
  )

  useEffect(() => {
    let retryTimeout: number | undefined

    const refresh = async (quiet: boolean) => {
      const ok = await loadOverview(quiet)
      // A transient failure right after an action (e.g. GitHub catching up)
      // should recover quickly rather than waiting for the next 30s poll.
      if (!ok && retryTimeout === undefined) {
        retryTimeout = window.setTimeout(() => {
          retryTimeout = undefined
          void loadOverview(true)
        }, 5_000)
      }
    }

    const initialLoad = window.setTimeout(() => void refresh(false), 0)
    const interval = window.setInterval(() => void refresh(true), 30_000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
      if (retryTimeout !== undefined) window.clearTimeout(retryTimeout)
    }
  }, [loadOverview])

  useEffect(() => {
    if (view !== "automations") return
    let cancelled = false
    void api.automation
      .scanSchedule({ repository })
      .then((state) => {
        if (!cancelled) setScanSchedule(state)
      })
      .catch(() => {
        if (!cancelled) {
          setScanSchedule({
            exists: false,
            created: false,
            scheduleId: null,
            name: null,
            frequency: null,
            enabled: null,
            lastExecutedAt: null,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [view, repository])

  async function runAction<Result>(
    key: string,
    action: () => Promise<Result>,
    success: string | ((result: Result) => string)
  ) {
    setBusyKey(key)
    try {
      const result = await action()
      toast.success(typeof success === "function" ? success(result) : success)
      const refreshed = await loadOverview(true)
      if (!refreshed) {
        window.setTimeout(() => void loadOverview(true), 5_000)
      }
    } catch (actionError) {
      const message =
        actionError instanceof Error
          ? actionError.message
          : "The operation failed"
      toast.error(message)
    } finally {
      setBusyKey(null)
    }
  }

  const displayOverview = useMemo(
    () =>
      overview ??
      (error
        ? createFallbackOverview(
            repository,
            selectedRepository.trackedIssues,
            service
          )
        : null),
    [error, overview, repository, selectedRepository.trackedIssues, service]
  )
  const issueRuns = useMemo(
    () => displayOverview?.issueRuns ?? [],
    [displayOverview?.issueRuns]
  )
  const sessionRuns = useMemo(
    () => issueRuns.filter(({ session }) => session !== null),
    [issueRuns]
  )
  const readyCount = useMemo(
    () =>
      issueRuns.filter(({ session }) => !session || session.isArchived).length,
    [issueRuns]
  )
  const pullRequestRuns = useMemo(
    () =>
      issueRuns.filter(({ session }) => Boolean(session?.pullRequests.length)),
    [issueRuns]
  )

  const configured = service.devinConfigured
  const refreshing = busyKey === "loading"
  const page = PAGE_COPY[view]

  return (
    <>
      <SiteHeader
        refreshing={refreshing}
        onRefresh={() => void loadOverview()}
      />
      <div className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:px-8 lg:py-9">
          <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
                {page.title}
              </h1>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                {page.description} {repository} has{" "}
                {displayOverview?.metrics.trackedIssues ??
                  selectedRepository.trackedIssues}{" "}
                tracked issues.
              </p>
            </div>
            {view === "overview" && (
              <ButtonGroup>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={
                        busyKey !== null || !service.githubWriteConfigured
                      }
                      onClick={() =>
                        void runAction(
                          "labels",
                          () => api.automation.ensureLabels({ repository }),
                          "Automation labels are ready"
                        )
                      }
                    >
                      <TagsIcon /> Sync labels
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-56">
                    Creates the devin-* label set in the GitHub repository so
                    issues can be triaged and trigger automation.
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={
                        busyKey !== null ||
                        !configured ||
                        !service.githubWriteConfigured
                      }
                      onClick={() =>
                        void runAction(
                          "reconcile",
                          () => api.automation.reconcile({ repository }),
                          "GitHub status reconciled"
                        )
                      }
                    >
                      <ActivityIcon /> Reconcile
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-56">
                    Syncs every Devin session back to GitHub: status labels and
                    the maintained status comment on each issue. Also runs
                    automatically every 5 minutes.
                  </TooltipContent>
                </Tooltip>
              </ButtonGroup>
            )}
          </section>

          {view === "overview" && (
            <SectionCards metrics={displayOverview?.metrics ?? null} />
          )}

          {error && !overview && (
            <Alert>
              <span className="text-amber-600 dark:text-amber-400">
                <TriangleAlertIcon className="size-4" />
              </span>
              <AlertTitle>Live repository sync unavailable</AlertTitle>
              <AlertDescription>
                Showing locally cached issue metadata. {error}
              </AlertDescription>
              <AlertAction>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadOverview()}
                >
                  Retry
                </Button>
              </AlertAction>
            </Alert>
          )}

          {displayOverview && !configured && (
            <Alert>
              <SettingsIcon className="size-4" />
              <AlertTitle>Connect Devin to enable session controls</AlertTitle>
              <AlertDescription>
                Add{" "}
                <code className="font-mono text-foreground">
                  DEVIN_API_TOKEN
                </code>{" "}
                and{" "}
                <code className="font-mono text-foreground">DEVIN_ORG_ID</code>{" "}
                to{" "}
                <code className="font-mono text-foreground">
                  apps/api/.env.local
                </code>
                .
              </AlertDescription>
            </Alert>
          )}

          {displayOverview &&
            configured &&
            !service.githubWriteConfigured &&
            (view === "overview" ||
              view === "automations" ||
              view === "configuration") && (
              <Alert>
                <SettingsIcon className="size-4" />
                <AlertTitle>
                  Connect GitHub to publish automation status
                </AlertTitle>
                <AlertDescription>
                  Devin sessions are available. Add{" "}
                  <code className="font-mono text-foreground">
                    GITHUB_TOKEN
                  </code>{" "}
                  to enable labels, issue comments, and reconciliation.
                </AlertDescription>
              </Alert>
            )}

          {view === "overview" && displayOverview && (
            <AutomationHealth overview={displayOverview} />
          )}

          {view === "overview" && displayOverview && (
            <section className="grid gap-3 lg:grid-cols-2">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Queue health</CardTitle>
                  <CardDescription>
                    Work that is ready, running, or waiting for a decision.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {[
                    ["Ready to launch", readyCount],
                    ["Active sessions", displayOverview.metrics.activeSessions],
                    ["Needs input", displayOverview.metrics.needsInput],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex min-h-10 items-center justify-between rounded-md px-3 text-sm hover:bg-muted/50"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono tabular-nums">{value}</span>
                    </div>
                  ))}
                  <Button asChild variant="outline" className="mt-3 w-full">
                    <Link href="/dashboard/issues">Open issue queue</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Observable output</CardTitle>
                  <CardDescription>
                    Every run remains traceable to its source issue.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {[
                    ["Tracked Devin sessions", sessionRuns.length],
                    [
                      "Pull requests created",
                      displayOverview.metrics.pullRequests,
                    ],
                    [
                      "Last repository refresh",
                      displayOverview.refreshedAt
                        ? formatDate(displayOverview.refreshedAt)
                        : "Cached",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex min-h-10 items-center justify-between gap-4 rounded-md px-3 text-sm hover:bg-muted/50"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-right font-mono text-xs tabular-nums">
                        {value}
                      </span>
                    </div>
                  ))}
                  <Button asChild variant="outline" className="mt-3 w-full">
                    <Link href="/dashboard/sessions">Inspect sessions</Link>
                  </Button>
                </CardContent>
              </Card>
            </section>
          )}

          {view === "issues" && (
            <section>
              <div className="mb-3">
                <h2 className="text-sm font-medium">Issue queue</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Launch remediation work or expand a row to manage its session.
                </p>
              </div>

              {displayOverview ? (
                <IssuesTable
                  runs={issueRuns}
                  busyKey={busyKey}
                  configured={configured}
                  repository={repository}
                  runAction={runAction}
                />
              ) : (
                <QueueSkeleton />
              )}
            </section>
          )}

          {view === "sessions" && (
            <section>
              {displayOverview ? (
                sessionRuns.length > 0 ? (
                  <IssuesTable
                    runs={sessionRuns}
                    busyKey={busyKey}
                    configured={configured}
                    repository={repository}
                    runAction={runAction}
                    showFilters={false}
                    emptyMessage="No sessions yet."
                  />
                ) : (
                  <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border bg-card p-8 text-center">
                    <span className="flex size-11 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
                      <MessageSquareIcon className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">No sessions yet</p>
                      <p className="mt-1 text-xs text-pretty text-muted-foreground">
                        Launch a tracked issue to start a repository-scoped
                        Devin session.
                      </p>
                    </div>
                    <Button asChild variant="outline">
                      <Link href="/dashboard/issues">Open issue queue</Link>
                    </Button>
                  </div>
                )
              ) : (
                <QueueSkeleton />
              )}
            </section>
          )}

          {view === "pull-requests" && (
            <section>
              {displayOverview ? (
                pullRequestRuns.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {pullRequestRuns.flatMap(({ issue, session }) =>
                      (session?.pullRequests ?? []).map((pullRequest) => (
                        <Card key={pullRequest.url} size="sm">
                          <CardHeader>
                            <div className="flex items-start justify-between gap-4">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
                                <GitPullRequestIcon className="size-4" />
                              </span>
                              <Badge variant="outline">
                                Issue #{issue.number}
                              </Badge>
                            </div>
                            <CardTitle className="pt-3 text-sm">
                              {pullRequest.title ?? issue.title}
                            </CardTitle>
                            <CardDescription>{issue.title}</CardDescription>
                          </CardHeader>
                          <CardContent className="flex items-center justify-between gap-3">
                            <span className="text-xs text-muted-foreground">
                              {session ? formatDate(session.updatedAt) : ""}
                            </span>
                            <Button asChild variant="outline" size="sm">
                              <a
                                href={pullRequest.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open PR <ExternalLinkIcon />
                              </a>
                            </Button>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border bg-card p-8 text-center">
                    <span className="flex size-11 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
                      <GitPullRequestIcon className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">
                        No pull requests yet
                      </p>
                      <p className="mt-1 text-xs text-pretty text-muted-foreground">
                        Pull requests created by tagged sessions will appear
                        here.
                      </p>
                    </div>
                    <Button asChild variant="outline">
                      <Link href="/dashboard/sessions">Inspect sessions</Link>
                    </Button>
                  </div>
                )
              ) : (
                <QueueSkeleton />
              )}
            </section>
          )}

          {view === "automations" && (
            <section className="grid gap-3 lg:grid-cols-2">
              {[
                {
                  icon: WebhookIcon,
                  title: "GitHub webhook",
                  cadence: "Event-driven trigger",
                  ready: service.webhookConfigured,
                  detail: (
                    <>
                      <code className="font-mono text-foreground">
                        POST /api/webhooks/github
                      </code>{" "}
                      — adding the{" "}
                      <code className="font-mono text-foreground">
                        devin-ready
                      </code>{" "}
                      label launches a remediation session. Comment commands:{" "}
                      <code className="font-mono text-foreground">/devin</code>,{" "}
                      <code className="font-mono text-foreground">
                        /devin retry
                      </code>
                      ,{" "}
                      <code className="font-mono text-foreground">
                        /devin stop
                      </code>
                      , or free-text instructions.
                    </>
                  ),
                  action: (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`https://github.com/${repository}/settings/hooks`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Webhook settings <ExternalLinkIcon />
                      </a>
                    </Button>
                  ),
                },
                {
                  icon: CalendarClockIcon,
                  title: "Scheduled reconciliation",
                  cadence: "Every 5 minutes · server cron (Vercel)",
                  ready: service.cronConfigured,
                  detail: (
                    <>
                      <code className="font-mono text-foreground">
                        GET /api/cron/reconcile
                      </code>{" "}
                      re-syncs every tracked Devin session back to GitHub:
                      status labels and the maintained status comment on each
                      issue.
                    </>
                  ),
                  action: (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        busyKey !== null ||
                        !configured ||
                        !service.githubWriteConfigured
                      }
                      onClick={() =>
                        void runAction(
                          "reconcile",
                          () => api.automation.reconcile({ repository }),
                          "GitHub status reconciled"
                        )
                      }
                    >
                      <ActivityIcon /> Run now
                    </Button>
                  ),
                },
                {
                  icon: ShieldAlertIcon,
                  title: "Daily vulnerability scan",
                  cadence: describeScanCadence(scanSchedule),
                  ready:
                    scanSchedule?.exists === true &&
                    scanSchedule.enabled !== false,
                  detail: (
                    <>
                      A recurring schedule registered natively in Devin runs a
                      session that audits the dependency manifests for known
                      vulnerabilities and files{" "}
                      <code className="font-mono text-foreground">[scan]</code>{" "}
                      issues labeled{" "}
                      <code className="font-mono text-foreground">
                        devin-scan
                      </code>
                      . Run scan launches an immediate one-off session; runs
                      appear on the Sessions page.
                    </>
                  ),
                  action: (
                    <>
                      {scanSchedule !== null && !scanSchedule.exists && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyKey !== null || !configured}
                          onClick={() =>
                            void runAction(
                              "scan-schedule",
                              async () => {
                                const state =
                                  await api.automation.ensureScanSchedule({
                                    repository,
                                  })
                                setScanSchedule(state)
                                return state
                              },
                              (state) =>
                                state.created
                                  ? "Daily scan scheduled in Devin"
                                  : "Daily scan schedule already exists"
                            )
                          }
                        >
                          <CalendarClockIcon /> Enable schedule
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyKey !== null || !configured}
                        onClick={() =>
                          void runAction(
                            "scan",
                            () => api.automation.scan({ repository }),
                            (result) =>
                              result.reused
                                ? `Scan session ${result.sessionId} is already active`
                                : `Scan session ${result.sessionId} launched`
                          )
                        }
                      >
                        <PlayIcon /> Run scan
                      </Button>
                    </>
                  ),
                },
                {
                  icon: TagsIcon,
                  title: "Label provisioning",
                  cadence: "Manual action",
                  ready: service.githubWriteConfigured,
                  detail: (
                    <>
                      Creates or updates the{" "}
                      <code className="font-mono text-foreground">devin-*</code>{" "}
                      label set (ready, running, needs-input, pr-open, failed,
                      complete) so issues can be triaged and trigger the
                      automation.
                    </>
                  ),
                  action: (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        busyKey !== null || !service.githubWriteConfigured
                      }
                      onClick={() =>
                        void runAction(
                          "labels",
                          () => api.automation.ensureLabels({ repository }),
                          "Automation labels are ready"
                        )
                      }
                    >
                      <TagsIcon /> Sync labels
                    </Button>
                  ),
                },
              ].map(({ icon: Icon, title, cadence, ready, detail, action }) => (
                <Card key={title} size="sm" className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <Badge variant="outline" className="gap-1.5">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            ready ? "bg-emerald-500" : "bg-muted-foreground/40"
                          )}
                        />
                        {ready ? "Ready" : "Setup required"}
                      </Badge>
                    </div>
                    <CardTitle className="pt-3 text-sm">{title}</CardTitle>
                    <CardDescription>{cadence}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
                      {detail}
                    </p>
                    <div className="flex justify-end gap-2">{action}</div>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}

          {view === "configuration" && (
            <>
              <section className="grid gap-3 lg:grid-cols-2">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Integrations</CardTitle>
                    <CardDescription>Current service readiness</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {displayOverview ? (
                      Object.entries({
                        "Devin API": displayOverview.service.devinConfigured,
                        "GitHub write":
                          displayOverview.service.githubWriteConfigured,
                        Webhook: displayOverview.service.webhookConfigured,
                        Schedule: displayOverview.service.cronConfigured,
                        "Control plane":
                          displayOverview.service.controlPlaneProtected,
                      }).map(([label, ready]) => (
                        <div
                          className="flex min-h-10 items-center justify-between rounded-md px-3 text-sm hover:bg-muted/50"
                          key={label}
                        >
                          <span className="text-muted-foreground">{label}</span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs",
                              ready
                                ? "text-emerald-500"
                                : "text-muted-foreground"
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                ready
                                  ? "bg-emerald-500"
                                  : "bg-muted-foreground/40"
                              )}
                            />
                            {ready ? "Ready" : "Missing"}
                          </span>
                        </div>
                      ))
                    ) : (
                      <Skeleton className="h-48 w-full" />
                    )}
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Repository</CardTitle>
                    <CardDescription>
                      The active scope for issue and session operations.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {[
                      ["Repository", repository],
                      ["Owner", selectedRepository.owner],
                      ["Tracked issues", selectedRepository.trackedIssues],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex min-h-10 items-center justify-between gap-4 rounded-md px-3 text-sm hover:bg-muted/50"
                      >
                        <span className="text-muted-foreground">{label}</span>
                        <span className="truncate font-mono text-xs tabular-nums">
                          {value}
                        </span>
                      </div>
                    ))}
                    <Button asChild variant="outline" className="mt-3 w-full">
                      <a
                        href={`https://github.com/${repository}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open repository <ExternalLinkIcon />
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              </section>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>How it runs</CardTitle>
                  <CardDescription>
                    Observable output stays attached to the source issue.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["01", "Trigger", "Label, comment, or launch from Issues"],
                    ["02", "Execute", "One tagged Devin session per issue"],
                    [
                      "03",
                      "Publish",
                      "PR link, status, tests, and UI evidence",
                    ],
                  ].map(([number, title, detail]) => (
                    <div
                      className="rounded-lg border bg-muted/40 p-3"
                      key={number}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {number}
                      </span>
                      <p className="mt-3 text-xs font-medium">{title}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-pretty text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}
