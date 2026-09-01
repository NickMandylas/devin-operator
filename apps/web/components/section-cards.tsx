import type { AutomationOverview } from "@superset-devin/contracts"
import {
  BotIcon,
  CircleDotIcon,
  GitPullRequestIcon,
  MessageSquareIcon,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const cards = [
  { key: "trackedIssues", label: "Tracked issues", icon: CircleDotIcon },
  { key: "activeSessions", label: "Active sessions", icon: BotIcon },
  { key: "needsInput", label: "Needs input", icon: MessageSquareIcon },
  { key: "pullRequests", label: "Pull requests", icon: GitPullRequestIcon },
] as const

export function SectionCards({
  metrics,
}: {
  metrics: AutomationOverview["metrics"] | null
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ key, label, icon: Icon }) => (
        <Card key={key} size="sm">
          <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              {label}
            </CardTitle>
            <Icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-medium tabular-nums">
              {metrics ? String(metrics[key]).padStart(2, "0") : "--"}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
