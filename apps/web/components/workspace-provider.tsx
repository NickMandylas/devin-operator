"use client"

import type {
  RepositorySummary,
  ServiceReadiness,
} from "@superset-devin/contracts"
import * as React from "react"

import { api } from "@/lib/orpc"

const DEFAULT_SERVICE: ServiceReadiness = {
  devinConfigured: false,
  githubWriteConfigured: false,
  webhookConfigured: false,
  cronConfigured: false,
  controlPlaneProtected: false,
}

const FALLBACK_REPOSITORY: RepositorySummary = {
  repository: "NickMandylas/superset",
  owner: "NickMandylas",
  name: "superset",
  trackedIssues: 4,
}

interface WorkspaceContextValue {
  repositories: RepositorySummary[]
  selectedRepository: RepositorySummary
  selectRepository: (repository: string) => void
  service: ServiceReadiness
  loading: boolean
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [repositories, setRepositories] = React.useState<RepositorySummary[]>([
    FALLBACK_REPOSITORY,
  ])
  const [selectedName, setSelectedName] = React.useState(
    FALLBACK_REPOSITORY.repository
  )
  const [service, setService] =
    React.useState<ServiceReadiness>(DEFAULT_SERVICE)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      try {
        const [configuredRepositories, readiness] = await Promise.all([
          api.repositories.list(),
          api.system.readiness(),
        ])
        if (cancelled) return

        const available =
          configuredRepositories.length > 0
            ? configuredRepositories
            : [FALLBACK_REPOSITORY]
        setRepositories(available)
        setService(readiness)
        setSelectedName((current) =>
          available.some((repository) => repository.repository === current)
            ? current
            : available[0].repository
        )
      } catch {
        if (!cancelled) setService(DEFAULT_SERVICE)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadWorkspace()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedRepository =
    repositories.find((repository) => repository.repository === selectedName) ??
    repositories[0]

  const value = React.useMemo(
    () => ({
      repositories,
      selectedRepository,
      selectRepository: setSelectedName,
      service,
      loading,
    }),
    [loading, repositories, selectedRepository, service]
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext)
  if (!context)
    throw new Error("useWorkspace must be used inside WorkspaceProvider")
  return context
}
