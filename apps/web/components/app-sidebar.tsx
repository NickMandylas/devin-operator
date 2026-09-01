"use client"

import Link from "next/link"
import {
  BotIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleDotIcon,
  FolderGit2Icon,
  GitPullRequestIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  WorkflowIcon,
} from "lucide-react"

import { CognitionLogo } from "@/components/cognition-logo"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useWorkspace } from "@/components/workspace-provider"

const navItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Issues", url: "/dashboard/issues", icon: CircleDotIcon },
  { title: "Sessions", url: "/dashboard/sessions", icon: BotIcon },
  {
    title: "Pull requests",
    url: "/dashboard/pull-requests",
    icon: GitPullRequestIcon,
  },
  {
    title: "Automations",
    url: "/dashboard/automations",
    icon: WorkflowIcon,
  },
  {
    title: "Configuration",
    url: "/dashboard/configuration",
    icon: Settings2Icon,
  },
]

function RepositorySwitcher() {
  const { isMobile } = useSidebar()
  const { repositories, selectedRepository, selectRepository, loading } =
    useWorkspace()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={loading}
              tooltip="Switch repository"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg border bg-background">
                <FolderGit2Icon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {selectedRepository.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {selectedRepository.owner}
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Repositories
            </DropdownMenuLabel>
            {repositories.map((repository) => (
              <DropdownMenuItem
                key={repository.repository}
                onSelect={() => selectRepository(repository.repository)}
                className="gap-2 p-2"
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <FolderGit2Icon className="size-3.5 shrink-0" />
                </div>
                <div className="grid flex-1 leading-tight">
                  <span className="truncate font-medium">
                    {repository.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {repository.owner} · {repository.trackedIssues} tracked
                  </span>
                </div>
                {repository.repository === selectedRepository.repository && (
                  <CheckIcon className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { selectedRepository } = useWorkspace()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="Cognition control plane"
            >
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <CognitionLogo className="size-4 brightness-0 invert" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Cognition</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Control plane
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <RepositorySwitcher />
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          user={{
            name: selectedRepository.owner,
            email: `github.com/${selectedRepository.owner}`,
            avatar: `https://github.com/${selectedRepository.owner}.png`,
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
