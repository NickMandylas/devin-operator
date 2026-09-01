import type { DevinSession, IssueCategory } from "@superset-devin/contracts"
import {
  AlertCircleIcon,
  ArchiveIcon,
  CheckCircle2Icon,
  CircleIcon,
  GitPullRequestIcon,
  Loader2Icon,
  MessageSquareIcon,
  type LucideIcon,
} from "lucide-react"

export type QueueFilter = "all" | "ready" | "active" | "input" | "pr"

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  dependency: "Dependency",
  vulnerability: "Security",
  ui: "UI",
  "code-quality": "Quality",
}

export interface SessionState {
  label: string
  color: string
  icon: LucideIcon
  outcome: "ready" | "active" | "input" | "pr" | "failed" | "complete"
}

export function getSessionState(session: DevinSession | null): SessionState {
  if (!session)
    return {
      label: "Ready",
      color: "text-muted-foreground",
      icon: CircleIcon,
      outcome: "ready",
    }
  if (session.isArchived)
    return {
      label: "Archived",
      color: "text-muted-foreground",
      icon: ArchiveIcon,
      outcome: "ready",
    }
  if (session.pullRequests.length > 0)
    return {
      label: "PR open",
      color: "text-violet-500 dark:text-violet-400",
      icon: GitPullRequestIcon,
      outcome: "pr",
    }
  if (
    ["waiting_for_user", "waiting_for_approval"].includes(
      session.statusDetail ?? ""
    )
  ) {
    return {
      label: "Needs input",
      color: "text-amber-600 dark:text-amber-400",
      icon: MessageSquareIcon,
      outcome: "input",
    }
  }
  if (
    session.status === "error" ||
    (session.status === "suspended" && session.statusDetail !== "inactivity")
  ) {
    return {
      label: "Failed",
      color: "text-destructive",
      icon: AlertCircleIcon,
      outcome: "failed",
    }
  }
  if (session.status === "exit" || session.statusDetail === "finished") {
    return {
      label: "Complete",
      color: "text-emerald-600 dark:text-emerald-400",
      icon: CheckCircle2Icon,
      outcome: "complete",
    }
  }
  return {
    label: session.statusDetail ?? session.status,
    color: "text-blue-600 dark:text-blue-400",
    icon: Loader2Icon,
    outcome: "active",
  }
}

export function matchesFilter(
  filter: QueueFilter,
  session: DevinSession | null
): boolean {
  if (filter === "all") return true
  if (filter === "ready") return !session || session.isArchived
  if (filter === "input")
    return ["waiting_for_user", "waiting_for_approval"].includes(
      session?.statusDetail ?? ""
    )
  if (filter === "pr") return Boolean(session?.pullRequests.length)
  return Boolean(
    session &&
    !session.isArchived &&
    ["new", "claimed", "running", "resuming"].includes(session.status) &&
    session.statusDetail !== "finished"
  )
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not started"
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}
