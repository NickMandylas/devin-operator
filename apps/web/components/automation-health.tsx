import type { AutomationOverview } from "@superset-devin/contracts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatDate, getSessionState } from "@/lib/sessions"
import { cn } from "@/lib/utils"

const OUTCOME_META = [
  { key: "complete", label: "Complete", swatch: "bg-emerald-500" },
  { key: "pr", label: "PR open", swatch: "bg-violet-500" },
  { key: "active", label: "Active", swatch: "bg-blue-500" },
  { key: "input", label: "Needs input", swatch: "bg-amber-500" },
  { key: "failed", label: "Failed", swatch: "bg-red-500" },
  { key: "ready", label: "Ready", swatch: "bg-muted-foreground/25" },
] as const

export function AutomationHealth({
  overview,
}: {
  overview: AutomationOverview
}) {
  const runs = overview.issueRuns
  const counts: Record<(typeof OUTCOME_META)[number]["key"], number> = {
    complete: 0,
    pr: 0,
    active: 0,
    input: 0,
    failed: 0,
    ready: 0,
  }
  let totalAcus = 0
  let launched = 0

  for (const run of runs) {
    counts[getSessionState(run.session).outcome] += 1
    if (run.session) {
      totalAcus += run.session.acusConsumed
      launched += 1
    }
  }

  const delivered = counts.complete + counts.pr
  const resolved = delivered + counts.failed
  const successRate =
    resolved > 0 ? `${Math.round((delivered / resolved) * 100)}%` : "—"
  const total = runs.length

  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Session outcomes</CardTitle>
          <CardDescription>
            Success and failure signals across the tracked queue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted">
            {total > 0 &&
              OUTCOME_META.filter(({ key }) => counts[key] > 0).map(
                ({ key, swatch }) => (
                  <div
                    key={key}
                    className={cn("h-full", swatch)}
                    style={{ width: `${(counts[key] / total) * 100}%` }}
                  />
                )
              )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {OUTCOME_META.map(({ key, label, swatch }) => (
              <div
                key={key}
                className="flex min-h-8 items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className={cn("size-2 rounded-full", swatch)} />
                  {label}
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {counts[key]}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Throughput</CardTitle>
          <CardDescription>
            Progress and compute across launched sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {(
            [
              ["Sessions launched", `${launched} / ${total}`],
              ["Delivered (PR or complete)", delivered],
              ["Success rate", successRate],
              ["Failures", counts.failed],
              ["ACUs consumed", totalAcus.toFixed(2)],
              [
                "Last refresh",
                overview.refreshedAt
                  ? formatDate(overview.refreshedAt)
                  : "Cached",
              ],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="flex min-h-8 items-center justify-between gap-4 rounded-md px-3 text-sm hover:bg-muted/50"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono text-xs tabular-nums">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
