"use client"

import type {
  AutomationOverview,
  SessionActivity,
} from "@superset-devin/contracts"
import * as React from "react"
import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  FlexRender,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table"
import {
  ActivityIcon,
  ArchiveIcon,
  ArrowUpDownIcon,
  BotIcon,
  ChevronDownIcon,
  CircleDotDashedIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  Loader2Icon,
  PlayIcon,
  SearchIcon,
  SendIcon,
  ShieldAlertIcon,
  SquareIcon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/lib/orpc"
import {
  CATEGORY_LABELS,
  formatDate,
  getSessionState,
  matchesFilter,
  type QueueFilter,
} from "@/lib/sessions"
import { cn } from "@/lib/utils"

type IssueRun = AutomationOverview["issueRuns"][number]

type RunAction = (
  key: string,
  action: () => Promise<unknown>,
  success: string
) => Promise<void>

const features = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
})

const columnHelper = createColumnHelper<typeof features, IssueRun>()

function SortableHeader({
  children,
  onToggle,
}: {
  children: React.ReactNode
  onToggle?: (event: unknown) => void
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-left hover:text-foreground"
      onClick={onToggle}
    >
      {children}
      <ArrowUpDownIcon className="size-3 text-muted-foreground/70" />
    </button>
  )
}

function ToolChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md border bg-background px-2 font-mono text-[10px] text-muted-foreground">
      {children}
    </span>
  )
}

const ACTIVITY_POLL_INTERVAL_MS = 10_000

function formatRelativeTime(value: string | null): string | null {
  if (!value) return null
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function CurrentActivity({
  session,
}: {
  session: NonNullable<IssueRun["session"]>
}) {
  // Poll only while the session is doing work; terminal sessions fetch once.
  const isActive = matchesFilter("active", session)
  const [activity, setActivity] = React.useState<SessionActivity | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const next = await api.sessions.activity({
          sessionId: session.sessionId,
        })
        if (cancelled) return
        setActivity(next)
        setFailed(false)
      } catch {
        // Background poll: keep the last snapshot instead of raising a toast.
        if (!cancelled) setFailed(true)
      }
    }

    void load()
    if (!isActive) {
      return () => {
        cancelled = true
      }
    }
    const timer = window.setInterval(() => {
      void load()
    }, ACTIVITY_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isActive, session.sessionId])

  const messages = activity?.recentMessages ?? []

  return (
    <div className="mt-3 max-w-2xl rounded-md border bg-background px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        <ActivityIcon className="size-3" />
        Current activity
        {isActive && (
          <span
            aria-hidden
            className="size-1.5 animate-pulse rounded-full bg-blue-500"
          />
        )}
      </div>
      {activity ? (
        messages.length > 0 ? (
          <ol className="mt-2 flex flex-col gap-2 border-l pl-3">
            {messages.map((entry, index) => {
              const newest = index === messages.length - 1
              return (
                <li
                  key={`${entry.timestamp ?? "pending"}-${index}`}
                  className="relative flex flex-col gap-0.5"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1 -left-[15px] size-1.5 rounded-full",
                      newest ? "bg-blue-500" : "bg-muted-foreground/30"
                    )}
                  />
                  <p
                    className={cn(
                      "font-mono text-[10px]",
                      newest
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                    )}
                  >
                    {entry.source === "user" ? "You" : "Devin"}
                    {entry.timestamp && (
                      <>
                        {" · "}
                        <span title={formatDate(entry.timestamp)}>
                          {formatRelativeTime(entry.timestamp)}
                        </span>
                      </>
                    )}
                  </p>
                  <p
                    className={cn(
                      "line-clamp-2 text-xs whitespace-pre-line",
                      newest ? "text-foreground/80" : "text-muted-foreground/70"
                    )}
                  >
                    {entry.text}
                  </p>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            No messages from Devin yet.
          </p>
        )
      ) : failed ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Activity is unavailable right now.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      )}
    </div>
  )
}

function SessionPanel({
  run,
  busyKey,
  runAction,
}: {
  run: IssueRun
  busyKey: string | null
  runAction: RunAction
}) {
  const [message, setMessage] = React.useState("")
  const session = run.session
  if (!session) return null

  return (
    <div className="bg-muted/40 px-4 py-4">
      <div className="flex flex-wrap gap-2">
        <ToolChip>
          <BotIcon className="size-3" /> {session.sessionId}
        </ToolChip>
        <ToolChip>
          <CircleDotDashedIcon className="size-3" />{" "}
          {session.statusDetail ?? session.status}
        </ToolChip>
        <ToolChip>{session.acusConsumed.toFixed(2)} ACU</ToolChip>
      </div>

      <CurrentActivity session={session} />

      <form
        className="mt-3 flex max-w-2xl gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!message.trim()) return
          void runAction(
            `message-${session.sessionId}`,
            () =>
              api.sessions.message({
                sessionId: session.sessionId,
                message,
              }),
            `Instruction sent to issue #${run.issue.number}`
          ).then(() => setMessage(""))
        }}
      >
        <Input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Continue the session with an instruction..."
          aria-label={`Instruction for issue ${run.issue.number}`}
          maxLength={10_000}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!message.trim() || busyKey !== null}
          aria-label="Send instruction"
        >
          <SendIcon />
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={session.url} target="_blank" rel="noreferrer">
            Open Devin <ExternalLinkIcon />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busyKey !== null}
          onClick={() =>
            void runAction(
              `archive-${session.sessionId}`,
              () => api.sessions.archive({ sessionId: session.sessionId }),
              `Archived issue #${run.issue.number}`
            )
          }
        >
          <ArchiveIcon /> Archive
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <SquareIcon /> Stop
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <ShieldAlertIcon />
              </AlertDialogMedia>
              <AlertDialogTitle>Stop this Devin session?</AlertDialogTitle>
              <AlertDialogDescription>
                The session for issue #{run.issue.number} will be terminated and
                archived. It cannot be resumed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  void runAction(
                    `stop-${session.sessionId}`,
                    () =>
                      api.sessions.terminate({
                        sessionId: session.sessionId,
                      }),
                    `Stopped issue #${run.issue.number}`
                  )
                }
              >
                Stop session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

export function IssuesTable({
  runs,
  busyKey,
  configured,
  repository,
  runAction,
  showFilters = true,
  emptyMessage = "No issues in this state.",
}: {
  runs: IssueRun[]
  busyKey: string | null
  configured: boolean
  repository: string
  runAction: RunAction
  showFilters?: boolean
  emptyMessage?: string
}) {
  const [filter, setFilter] = React.useState<QueueFilter>("all")
  const [search, setSearch] = React.useState("")
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [expandedIssue, setExpandedIssue] = React.useState<number | null>(null)

  const filterCounts = React.useMemo(
    () => ({
      all: runs.length,
      ready: runs.filter(({ session }) => matchesFilter("ready", session))
        .length,
      active: runs.filter(({ session }) => matchesFilter("active", session))
        .length,
      input: runs.filter(({ session }) => matchesFilter("input", session))
        .length,
      pr: runs.filter(({ session }) => matchesFilter("pr", session)).length,
    }),
    [runs]
  )

  const filteredRuns = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return runs.filter(({ issue, session }) => {
      if (showFilters && !matchesFilter(filter, session)) return false
      if (!query) return true
      return (
        issue.title.toLowerCase().includes(query) ||
        `#${issue.number}`.includes(query) ||
        String(issue.number).includes(query)
      )
    })
  }, [filter, runs, search, showFilters])

  const columns = React.useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((run) => getSessionState(run.session).label, {
          id: "status",
          header: ({ column }) => (
            <SortableHeader onToggle={column.getToggleSortingHandler()}>
              Status
            </SortableHeader>
          ),
          cell: ({ row }) => {
            const state = getSessionState(row.original.session)
            const StateIcon = state.icon
            return (
              <span
                className={cn("inline-flex items-center gap-1.5", state.color)}
              >
                <StateIcon
                  className={cn(
                    "size-3.5",
                    state.outcome === "active" &&
                      state.icon === Loader2Icon &&
                      "animate-spin"
                  )}
                />
                {state.label}
              </span>
            )
          },
        }),
        columnHelper.accessor((run) => run.issue.number, {
          id: "issue",
          header: ({ column }) => (
            <SortableHeader onToggle={column.getToggleSortingHandler()}>
              Issue
            </SortableHeader>
          ),
          cell: ({ row }) => (
            <div className="flex max-w-md min-w-0 items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                #{row.original.issue.number}
              </span>
              <a
                href={row.original.issue.url}
                target="_blank"
                rel="noreferrer"
                className="truncate font-medium hover:underline"
              >
                {row.original.issue.title}
              </a>
            </div>
          ),
        }),
        columnHelper.accessor((run) => run.issue.category, {
          id: "category",
          header: "Category",
          cell: ({ row }) => (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[9px] tracking-wide uppercase"
            >
              {CATEGORY_LABELS[row.original.issue.category]}
            </Badge>
          ),
        }),
        columnHelper.accessor((run) => run.session?.acusConsumed ?? -1, {
          id: "acu",
          header: ({ column }) => (
            <SortableHeader onToggle={column.getToggleSortingHandler()}>
              ACU
            </SortableHeader>
          ),
          cell: ({ row }) =>
            row.original.session ? (
              <span className="font-mono text-xs tabular-nums">
                {row.original.session.acusConsumed.toFixed(2)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
        columnHelper.accessor((run) => run.session?.updatedAt ?? "", {
          id: "updated",
          header: ({ column }) => (
            <SortableHeader onToggle={column.getToggleSortingHandler()}>
              Updated
            </SortableHeader>
          ),
          cell: ({ row }) =>
            row.original.session ? (
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {formatDate(row.original.session.updatedAt)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            const { issue, session } = row.original
            const canLaunch = !session || session.isArchived
            const busy =
              busyKey?.includes(
                session?.sessionId ?? `issue-${issue.number}`
              ) ?? false

            return (
              <div className="flex items-center justify-end gap-1">
                {canLaunch ? (
                  <Button
                    size="sm"
                    disabled={!configured || busyKey !== null}
                    onClick={() =>
                      void runAction(
                        `issue-${issue.number}`,
                        () =>
                          api.sessions.start({
                            issueNumber: issue.number,
                            repository,
                          }),
                        `Started issue #${issue.number}`
                      )
                    }
                  >
                    {busy ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <PlayIcon />
                    )}
                    {session?.isArchived ? "Run again" : "Launch"}
                  </Button>
                ) : (
                  <>
                    {session.pullRequests[0] && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={session.pullRequests[0].url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <GitPullRequestIcon /> PR
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`View session for issue ${issue.number}`}
                      aria-expanded={expandedIssue === issue.number}
                      onClick={() =>
                        setExpandedIssue((current) =>
                          current === issue.number ? null : issue.number
                        )
                      }
                    >
                      <ChevronDownIcon
                        className={cn(
                          "transition-transform",
                          expandedIssue === issue.number && "rotate-180"
                        )}
                      />
                    </Button>
                  </>
                )}
              </div>
            )
          },
        }),
      ]),
    [busyKey, configured, expandedIssue, repository, runAction]
  )

  const table = useTable({
    features,
    data: filteredRuns,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (run) => String(run.issue.number),
  })

  return (
    <div className="flex flex-col gap-3">
      {showFilters && (
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-64">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter issues..."
              className="pl-8"
              aria-label="Filter issues"
            />
          </div>
          <ButtonGroup className="overflow-x-auto">
            {(
              [
                ["all", "All"],
                ["ready", "Ready"],
                ["active", "Active"],
                ["input", "Needs input"],
                ["pr", "PRs"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={filter === value ? "secondary" : "outline"}
                size="sm"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {label}{" "}
                <span className="font-mono text-[10px] text-muted-foreground">
                  {filterCounts[value]}
                </span>
              </Button>
            ))}
          </ButtonGroup>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : (
                      <FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                  {expandedIssue === row.original.issue.number &&
                    row.original.session && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={columns.length} className="p-0">
                          <SessionPanel
                            run={row.original}
                            busyKey={busyKey}
                            runAction={runAction}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                </React.Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
