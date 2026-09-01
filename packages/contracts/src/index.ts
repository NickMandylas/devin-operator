import { oc } from "@orpc/contract";
import { z } from "zod";

export const RepositoryNameSchema = z
  .string()
  .regex(/^[^/\s]+\/[^/\s]+$/, "Repository must use the owner/name format");

export const RepositorySummarySchema = z.object({
  repository: RepositoryNameSchema,
  owner: z.string(),
  name: z.string(),
  trackedIssues: z.number().int().nonnegative(),
});

const RepositorySelectionSchema = z
  .object({ repository: RepositoryNameSchema.optional() })
  .optional();

export const IssueCategorySchema = z.enum([
  "dependency",
  "vulnerability",
  "ui",
  "code-quality",
]);

export const IssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  url: z.url(),
  state: z.enum(["open", "closed"]),
  labels: z.array(z.string()),
  category: IssueCategorySchema,
});

export const PullRequestSchema = z.object({
  url: z.url(),
  title: z.string().nullable(),
});

export const DevinSessionSchema = z.object({
  sessionId: z.string(),
  title: z.string().nullable(),
  url: z.url(),
  status: z.string(),
  statusDetail: z.string().nullable(),
  acusConsumed: z.number(),
  isArchived: z.boolean(),
  tags: z.array(z.string()),
  pullRequests: z.array(PullRequestSchema),
  structuredOutput: z.unknown().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const SessionActivityMessageSchema = z.object({
  source: z.enum(["devin", "user"]),
  text: z.string(),
  timestamp: z.string().nullable(),
});

export const SessionActivitySchema = z.object({
  sessionId: z.string(),
  status: z.string(),
  statusDetail: z.string().nullable(),
  updatedAt: z.string().nullable(),
  latestMessage: SessionActivityMessageSchema.nullable(),
  recentMessages: z.array(SessionActivityMessageSchema),
});

export const IssueRunSchema = z.object({
  issue: IssueSchema,
  session: DevinSessionSchema.nullable(),
});

export const ServiceReadinessSchema = z.object({
  devinConfigured: z.boolean(),
  githubWriteConfigured: z.boolean(),
  webhookConfigured: z.boolean(),
  cronConfigured: z.boolean(),
  controlPlaneProtected: z.boolean(),
});

export const AutomationOverviewSchema = z.object({
  repository: z.string(),
  service: ServiceReadinessSchema,
  issueRuns: z.array(IssueRunSchema),
  metrics: z.object({
    trackedIssues: z.number().int().nonnegative(),
    activeSessions: z.number().int().nonnegative(),
    needsInput: z.number().int().nonnegative(),
    pullRequests: z.number().int().nonnegative(),
  }),
  refreshedAt: z.string(),
});

export const HealthSchema = z.object({
  ok: z.literal(true),
  service: z.literal("remediation-control-api"),
  version: z.string(),
  timestamp: z.string(),
});

export const OperationResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

export const ReconcileResultSchema = z.object({
  ok: z.boolean(),
  checked: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  errors: z.array(z.string()),
});

export const ScanSessionResultSchema = z.object({
  sessionId: z.string(),
  url: z.url(),
  title: z.string().nullable(),
  reused: z.boolean(),
});

export const ScanScheduleStateSchema = z.object({
  exists: z.boolean(),
  created: z.boolean(),
  scheduleId: z.string().nullable(),
  name: z.string().nullable(),
  frequency: z.string().nullable(),
  enabled: z.boolean().nullable(),
  lastExecutedAt: z.string().nullable(),
});

export const contract = {
  system: {
    health: oc.output(HealthSchema),
    readiness: oc.output(ServiceReadinessSchema),
  },
  repositories: {
    list: oc.output(z.array(RepositorySummarySchema)),
  },
  issues: {
    list: oc.input(RepositorySelectionSchema).output(z.array(IssueSchema)),
  },
  automation: {
    overview: oc
      .input(RepositorySelectionSchema)
      .output(AutomationOverviewSchema),
    ensureLabels: oc
      .input(RepositorySelectionSchema)
      .output(OperationResultSchema),
    reconcile: oc
      .input(RepositorySelectionSchema)
      .output(ReconcileResultSchema),
    scan: oc
      .input(RepositorySelectionSchema)
      .output(ScanSessionResultSchema),
    scanSchedule: oc
      .input(RepositorySelectionSchema)
      .output(ScanScheduleStateSchema),
    ensureScanSchedule: oc
      .input(RepositorySelectionSchema)
      .output(ScanScheduleStateSchema),
  },
  sessions: {
    list: oc.output(z.array(DevinSessionSchema)),
    get: oc
      .input(z.object({ sessionId: z.string().min(1) }))
      .output(DevinSessionSchema),
    activity: oc
      .input(z.object({ sessionId: z.string().min(1) }))
      .output(SessionActivitySchema),
    start: oc
      .input(
        z.object({
          issueNumber: z.number().int().positive(),
          repository: RepositoryNameSchema.optional(),
          maxAcuLimit: z.number().int().min(1).max(1000).optional(),
          force: z.boolean().optional(),
        }),
      )
      .output(DevinSessionSchema),
    message: oc
      .input(
        z.object({
          sessionId: z.string().min(1),
          message: z.string().trim().min(1).max(10_000),
        }),
      )
      .output(OperationResultSchema),
    archive: oc
      .input(z.object({ sessionId: z.string().min(1) }))
      .output(OperationResultSchema),
    terminate: oc
      .input(z.object({ sessionId: z.string().min(1) }))
      .output(OperationResultSchema),
  },
};

export type AutomationContract = typeof contract;
export type AutomationOverview = z.infer<typeof AutomationOverviewSchema>;
export type DevinSession = z.infer<typeof DevinSessionSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type IssueCategory = z.infer<typeof IssueCategorySchema>;
export type RepositorySummary = z.infer<typeof RepositorySummarySchema>;
export type ScanScheduleState = z.infer<typeof ScanScheduleStateSchema>;
export type ScanSessionResult = z.infer<typeof ScanSessionResultSchema>;
export type ServiceReadiness = z.infer<typeof ServiceReadinessSchema>;
export type SessionActivity = z.infer<typeof SessionActivitySchema>;
export type SessionActivityMessage = z.infer<
  typeof SessionActivityMessageSchema
>;
