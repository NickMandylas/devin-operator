import type { DevinSession } from "@superset-devin/contracts";
import { AUTOMATION_TAG } from "./automation";
import { getConfig } from "./config";
import {
  createDevinSchedule,
  createDevinSession,
  listDevinSchedules,
  listDevinSessions,
  type DevinSchedule,
} from "./devin-client";
import {
  buildDependencyScanPrompt,
  DEPENDENCY_SCAN_TAG,
  repositoryTag,
} from "./prompt";

// Recurring audit sessions stay cheap: reporting findings needs far fewer
// ACUs than remediation work.
export const SCAN_MAX_ACU_LIMIT = 5;

// The daily cron may fire more than once (redeploys, manual runs). Any scan
// session created within this window is reused instead of relaunched.
export const SCAN_REUSE_WINDOW_HOURS = 20;

export interface ScanSessionResult {
  session: DevinSession;
  reused: boolean;
}

function isScanSessionActive(session: DevinSession): boolean {
  return (
    ["new", "claimed", "running", "resuming"].includes(session.status) &&
    session.statusDetail !== "finished"
  );
}

export function findReusableScanSession(
  repository: string,
  sessions: DevinSession[],
  now: number = Date.now(),
): DevinSession | undefined {
  const selectedRepositoryTag = repositoryTag(repository);
  const windowStart = now - SCAN_REUSE_WINDOW_HOURS * 60 * 60 * 1000;

  return sessions
    .filter((session) => {
      if (session.isArchived) return false;
      if (
        !session.tags.includes(AUTOMATION_TAG) ||
        !session.tags.includes(DEPENDENCY_SCAN_TAG) ||
        !session.tags.includes(selectedRepositoryTag)
      ) {
        return false;
      }

      if (isScanSessionActive(session)) return true;
      const createdAt = session.createdAt
        ? Date.parse(session.createdAt)
        : Number.NaN;
      return Number.isFinite(createdAt) && createdAt >= windowStart;
    })
    .sort((left, right) =>
      (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
    )[0];
}

export async function startDependencyScanSession(
  repository?: string,
): Promise<ScanSessionResult> {
  const config = getConfig(repository);
  const sessions = await listDevinSessions();

  const existing = findReusableScanSession(config.repository, sessions);
  if (existing) return { session: existing, reused: true };

  const session = await createDevinSession({
    prompt: buildDependencyScanPrompt(config.repository),
    repository: config.repository,
    title: `${config.repo}: daily dependency vulnerability scan`,
    tags: [
      AUTOMATION_TAG,
      repositoryTag(config.repository),
      DEPENDENCY_SCAN_TAG,
    ],
    maxAcuLimit: SCAN_MAX_ACU_LIMIT,
  });

  return { session, reused: false };
}

// 02:00 UTC daily, mirroring the retired Vercel cron entry.
export const SCAN_SCHEDULE_FREQUENCY = "0 2 * * *";

export function scanScheduleName(repository: string): string {
  return `Daily dependency vulnerability scan · ${repository}`;
}

export function findScanSchedule(
  repository: string,
  schedules: DevinSchedule[],
): DevinSchedule | undefined {
  const selectedRepositoryTag = repositoryTag(repository);
  const name = scanScheduleName(repository);

  return schedules.find(
    (schedule) =>
      (schedule.tags.includes(DEPENDENCY_SCAN_TAG) &&
        schedule.tags.includes(selectedRepositoryTag)) ||
      schedule.name === name,
  );
}

export async function getScanSchedule(
  repository?: string,
): Promise<DevinSchedule | null> {
  const config = getConfig(repository);
  const schedules = await listDevinSchedules();
  return findScanSchedule(config.repository, schedules) ?? null;
}

export interface ScanScheduleResult {
  schedule: DevinSchedule;
  created: boolean;
}

export async function ensureScanSchedule(
  repository?: string,
): Promise<ScanScheduleResult> {
  const config = getConfig(repository);
  const existing = await getScanSchedule(config.repository);
  if (existing) return { schedule: existing, created: false };

  const schedule = await createDevinSchedule({
    name: scanScheduleName(config.repository),
    prompt: buildDependencyScanPrompt(config.repository),
    frequency: SCAN_SCHEDULE_FREQUENCY,
    tags: [
      AUTOMATION_TAG,
      repositoryTag(config.repository),
      DEPENDENCY_SCAN_TAG,
    ],
  });

  return { schedule, created: true };
}
