import { contract } from "@superset-devin/contracts";
import { implement } from "@orpc/server";
import {
  archiveIssueSession,
  ensureAutomationLabels,
  getAutomationOverview,
  getDevinSession,
  listDevinSessions,
  messageIssueSession,
  reconcileSessions,
  startIssueSession,
  terminateIssueSession,
} from "./automation";
import { getRepositoryConfigs, getRuntimeReadiness } from "./config";
import { getDevinSessionActivity, type DevinSchedule } from "./devin-client";
import { listTrackedIssues } from "./github-client";
import {
  ensureScanSchedule,
  getScanSchedule,
  startDependencyScanSession,
} from "./scanner";

const os = implement(contract);

function toScanScheduleState(
  schedule: DevinSchedule | null,
  created = false,
) {
  return {
    exists: schedule !== null,
    created,
    scheduleId: schedule?.scheduleId ?? null,
    name: schedule?.name ?? null,
    frequency: schedule?.frequency ?? null,
    enabled: schedule?.enabled ?? null,
    lastExecutedAt: schedule?.lastExecutedAt ?? null,
  };
}

export const router = os.router({
  system: {
    health: os.system.health.handler(() => ({
      ok: true,
      service: "remediation-control-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    })),
    readiness: os.system.readiness.handler(() => getRuntimeReadiness()),
  },
  repositories: {
    list: os.repositories.list.handler(() =>
      getRepositoryConfigs().map((repository) => ({
        repository: repository.repository,
        owner: repository.owner,
        name: repository.repo,
        trackedIssues: repository.trackedIssues.length,
      })),
    ),
  },
  issues: {
    list: os.issues.list.handler(({ input }) =>
      listTrackedIssues(input?.repository),
    ),
  },
  automation: {
    overview: os.automation.overview.handler(({ input }) =>
      getAutomationOverview(input?.repository),
    ),
    ensureLabels: os.automation.ensureLabels.handler(async ({ input }) => {
      await ensureAutomationLabels(input?.repository);
      return { ok: true, message: "Automation labels are ready" };
    }),
    reconcile: os.automation.reconcile.handler(({ input }) =>
      reconcileSessions(input?.repository),
    ),
    scan: os.automation.scan.handler(async ({ input }) => {
      const { session, reused } = await startDependencyScanSession(
        input?.repository,
      );
      return {
        sessionId: session.sessionId,
        url: session.url,
        title: session.title,
        reused,
      };
    }),
    scanSchedule: os.automation.scanSchedule.handler(async ({ input }) =>
      toScanScheduleState(await getScanSchedule(input?.repository)),
    ),
    ensureScanSchedule: os.automation.ensureScanSchedule.handler(
      async ({ input }) => {
        const { schedule, created } = await ensureScanSchedule(
          input?.repository,
        );
        return toScanScheduleState(schedule, created);
      },
    ),
  },
  sessions: {
    list: os.sessions.list.handler(() => listDevinSessions()),
    get: os.sessions.get.handler(({ input }) =>
      getDevinSession(input.sessionId),
    ),
    activity: os.sessions.activity.handler(({ input }) =>
      getDevinSessionActivity(input.sessionId),
    ),
    start: os.sessions.start.handler(({ input }) =>
      startIssueSession(
        input.issueNumber,
        {
          force: input.force,
          maxAcuLimit: input.maxAcuLimit,
        },
        input.repository,
      ),
    ),
    message: os.sessions.message.handler(async ({ input }) => {
      await messageIssueSession(input.sessionId, input.message);
      return { ok: true, message: "Message sent to Devin" };
    }),
    archive: os.sessions.archive.handler(async ({ input }) => {
      await archiveIssueSession(input.sessionId);
      return { ok: true, message: "Session archived" };
    }),
    terminate: os.sessions.terminate.handler(async ({ input }) => {
      await terminateIssueSession(input.sessionId);
      return { ok: true, message: "Session terminated and archived" };
    }),
  },
});
