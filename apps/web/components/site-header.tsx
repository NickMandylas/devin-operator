"use client"

import { usePathname } from "next/navigation"
import { MoonIcon, RefreshCwIcon, SunIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useTheme } from "@/components/theme-provider"
import { useWorkspace } from "@/components/workspace-provider"
import { cn } from "@/lib/utils"

export function SiteHeader({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean
  onRefresh: () => void
}) {
  const { theme, toggleTheme } = useTheme()
  const pathname = usePathname()
  const { selectedRepository, service } = useWorkspace()
  const configured = service.devinConfigured
  const pageLabel =
    {
      "/dashboard": "Overview",
      "/dashboard/issues": "Issues",
      "/dashboard/sessions": "Sessions",
      "/dashboard/pull-requests": "Pull requests",
      "/dashboard/automations": "Automations",
      "/dashboard/configuration": "Configuration",
    }[pathname] ?? "Workspace"

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-sm"
        >
          <span className="hidden truncate text-muted-foreground sm:inline">
            {selectedRepository.name}
          </span>
          <span
            className="hidden text-muted-foreground/50 sm:inline"
            aria-hidden="true"
          >
            /
          </span>
          <span className="truncate font-medium">{pageLabel}</span>
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:gap-2">
          <Badge variant="outline" className="hidden gap-1.5 sm:inline-flex">
            <span
              className={cn(
                "size-1.5 rounded-full",
                configured ? "bg-emerald-500" : "bg-amber-500"
              )}
            />
            {configured ? "Devin connected" : "Setup required"}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh data"
          >
            <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Toggle theme"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </div>
    </header>
  )
}
