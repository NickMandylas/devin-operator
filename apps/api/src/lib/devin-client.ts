import type { DevinSession, SessionActivity } from '@superset-devin/contracts'
import { z } from 'zod'
import { requireDevinConfig } from './config'

const RawPullRequestSchema = z.object({
  pr_url: z.url(),
  pr_state: z.string().nullable().optional(),
})

const RawSessionSchema = z.object({
  session_id: z.string(),
  title: z.string().nullable().optional(),
  url: z.url(),
  status: z.string().default('new'),
  status_detail: z.string().nullable().optional(),
  acus_consumed: z.number().default(0),
  is_archived: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  pull_requests: z.array(RawPullRequestSchema).default([]),
  structured_output: z.unknown().nullable().optional(),
  created_at: z.number().nullable().optional(),
  updated_at: z.number().nullable().optional(),
})

const RawSessionListSchema = z.object({
  items: z.array(RawSessionSchema),
  end_cursor: z.string().nullable().optional(),
  has_next_page: z.boolean().default(false),
})

const RawSessionMessageSchema = z.object({
  event_id: z.string(),
  source: z.string().default('devin'),
  message: z.string(),
  created_at: z.number().nullable().optional(),
})

const RawSessionMessageListSchema = z.object({
  items: z.array(RawSessionMessageSchema),
  end_cursor: z.string().nullable().optional(),
  has_next_page: z.boolean().default(false),
})

const RawScheduleSchema = z.object({
  scheduled_session_id: z.string(),
  name: z.string(),
  prompt: z.string(),
  frequency: z.string().nullable(),
  schedule_type: z.string().default('recurring'),
  enabled: z.boolean(),
  tags: z.array(z.string()).nullable().optional(),
  last_executed_at: z.string().nullable().optional(),
  created_at: z.string(),
})

const RawScheduleListSchema = z.object({
  items: z.array(RawScheduleSchema),
  end_cursor: z.string().nullable().optional(),
  has_next_page: z.boolean().default(false),
})

export interface CreateDevinSessionInput {
  prompt: string
  repository: string
  title: string
  tags: string[]
  maxAcuLimit: number
}

export interface DevinSchedule {
  scheduleId: string
  name: string
  prompt: string
  frequency: string | null
  scheduleType: string
  enabled: boolean
  tags: string[]
  lastExecutedAt: string | null
  createdAt: string
}

export interface CreateDevinScheduleInput {
  name: string
  prompt: string
  frequency: string
  tags: string[]
}

export class DevinApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody?: string,
  ) {
    super(message)
    this.name = 'DevinApiError'
  }
}

function toIsoDate(timestamp: number | null | undefined): string | null {
  if (!timestamp) return null
  return new Date(timestamp * 1000).toISOString()
}

function mapSession(raw: z.infer<typeof RawSessionSchema>): DevinSession {
  return {
    sessionId: raw.session_id,
    title: raw.title ?? null,
    url: raw.url,
    status: raw.status,
    statusDetail: raw.status_detail ?? null,
    acusConsumed: raw.acus_consumed,
    isArchived: raw.is_archived,
    tags: raw.tags,
    pullRequests: raw.pull_requests.map((pullRequest) => ({
      url: pullRequest.pr_url,
      title: pullRequest.pr_state ? `Pull request (${pullRequest.pr_state})` : null,
    })),
    structuredOutput: raw.structured_output ?? null,
    createdAt: toIsoDate(raw.created_at),
    updatedAt: toIsoDate(raw.updated_at),
  }
}

async function devinRequest(path: string, init?: RequestInit): Promise<unknown> {
  const config = requireDevinConfig()
  let lastError: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${config.devinBaseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${config.devinApiToken}`,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      })

      const body = await response.text()
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
          continue
        }
        throw new DevinApiError(`Devin API returned ${response.status}`, response.status, body)
      }

      return body ? JSON.parse(body) : null
    } catch (error) {
      lastError = error
      if (error instanceof DevinApiError || attempt === 2) throw error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Devin API request failed')
}

function sessionPath(suffix = ''): string {
  const { devinOrgId } = requireDevinConfig()
  return `/organizations/${encodeURIComponent(devinOrgId)}/sessions${suffix}`
}

function schedulePath(suffix = ''): string {
  const { devinOrgId } = requireDevinConfig()
  return `/organizations/${encodeURIComponent(devinOrgId)}/schedules${suffix}`
}

function mapSchedule(raw: z.infer<typeof RawScheduleSchema>): DevinSchedule {
  return {
    scheduleId: raw.scheduled_session_id,
    name: raw.name,
    prompt: raw.prompt,
    frequency: raw.frequency,
    scheduleType: raw.schedule_type,
    enabled: raw.enabled,
    tags: raw.tags ?? [],
    lastExecutedAt: raw.last_executed_at ?? null,
    createdAt: raw.created_at,
  }
}

export async function listDevinSchedules(): Promise<DevinSchedule[]> {
  const schedules: DevinSchedule[] = []
  let after: string | undefined

  do {
    const query = new URLSearchParams({ first: '100' })
    if (after) query.set('after', after)
    const raw = RawScheduleListSchema.parse(
      await devinRequest(`${schedulePath()}?${query.toString()}`),
    )
    schedules.push(...raw.items.map(mapSchedule))
    after = raw.has_next_page ? (raw.end_cursor ?? undefined) : undefined
  } while (after)

  return schedules
}

export async function createDevinSchedule(
  input: CreateDevinScheduleInput,
): Promise<DevinSchedule> {
  const raw = RawScheduleSchema.parse(
    await devinRequest(schedulePath(), {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        prompt: input.prompt,
        schedule_type: 'recurring',
        frequency: input.frequency,
        tags: input.tags,
        notify_on: 'failure',
      }),
    }),
  )
  return mapSchedule(raw)
}

export async function listDevinSessions(): Promise<DevinSession[]> {
  const sessions: DevinSession[] = []
  let after: string | undefined

  do {
    const query = new URLSearchParams({ first: '200' })
    if (after) query.set('after', after)
    const raw = RawSessionListSchema.parse(
      await devinRequest(`${sessionPath()}?${query.toString()}`),
    )
    sessions.push(...raw.items.map(mapSession))
    after = raw.has_next_page ? (raw.end_cursor ?? undefined) : undefined
  } while (after)

  return sessions
}

export async function getDevinSession(sessionId: string): Promise<DevinSession> {
  const raw = RawSessionSchema.parse(
    await devinRequest(sessionPath(`/${encodeURIComponent(sessionId)}`)),
  )
  return mapSession(raw)
}

const ACTIVITY_MESSAGE_MAX_LENGTH = 500
const ACTIVITY_TAIL_BUFFER = 25
const ACTIVITY_RECENT_COUNT = 8

function truncateActivityText(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= ACTIVITY_MESSAGE_MAX_LENGTH) return trimmed
  return `${trimmed.slice(0, ACTIVITY_MESSAGE_MAX_LENGTH - 1)}…`
}

function mapActivityMessage(
  raw: z.infer<typeof RawSessionMessageSchema>,
): SessionActivity['recentMessages'][number] {
  return {
    source: raw.source === 'user' ? 'user' : 'devin',
    text: truncateActivityText(raw.message),
    timestamp: toIsoDate(raw.created_at),
  }
}

/**
 * Messages are returned oldest-first with cursor pagination, so we walk all
 * pages but only keep a small rolling tail to bound memory on long sessions.
 */
async function listRecentDevinSessionMessages(
  sessionId: string,
): Promise<z.infer<typeof RawSessionMessageSchema>[]> {
  let tail: z.infer<typeof RawSessionMessageSchema>[] = []
  let after: string | undefined

  do {
    const query = new URLSearchParams({ first: '200' })
    if (after) query.set('after', after)
    const raw = RawSessionMessageListSchema.parse(
      await devinRequest(
        `${sessionPath(`/${encodeURIComponent(sessionId)}/messages`)}?${query.toString()}`,
      ),
    )
    tail = [...tail, ...raw.items].slice(-ACTIVITY_TAIL_BUFFER)
    after = raw.has_next_page ? (raw.end_cursor ?? undefined) : undefined
  } while (after)

  return tail
}

export async function getDevinSessionActivity(sessionId: string): Promise<SessionActivity> {
  const [session, messages] = await Promise.all([
    getDevinSession(sessionId),
    listRecentDevinSessionMessages(sessionId),
  ])

  const latestDevinMessage = [...messages]
    .reverse()
    .find((message) => message.source !== 'user')

  return {
    sessionId: session.sessionId,
    status: session.status,
    statusDetail: session.statusDetail,
    updatedAt: session.updatedAt,
    latestMessage: latestDevinMessage ? mapActivityMessage(latestDevinMessage) : null,
    recentMessages: messages.slice(-ACTIVITY_RECENT_COUNT).map(mapActivityMessage),
  }
}

export async function createDevinSession(input: CreateDevinSessionInput): Promise<DevinSession> {
  const structuredOutputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'tests', 'pull_request_url', 'ui_evidence'],
    properties: {
      summary: { type: 'string' },
      tests: { type: 'array', items: { type: 'string' } },
      pull_request_url: { type: ['string', 'null'] },
      ui_evidence: { type: 'array', items: { type: 'string' } },
    },
  }

  const raw = RawSessionSchema.parse(
    await devinRequest(sessionPath(), {
      method: 'POST',
      body: JSON.stringify({
        prompt: input.prompt,
        repos: [input.repository],
        title: input.title,
        tags: input.tags,
        max_acu_limit: input.maxAcuLimit,
        structured_output_required: true,
        structured_output_schema: structuredOutputSchema,
      }),
    }),
  )
  return mapSession(raw)
}

export async function sendDevinMessage(sessionId: string, message: string): Promise<DevinSession> {
  const raw = RawSessionSchema.parse(
    await devinRequest(sessionPath(`/${encodeURIComponent(sessionId)}/messages`), {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  )
  return mapSession(raw)
}

export async function archiveDevinSession(sessionId: string): Promise<DevinSession> {
  const raw = RawSessionSchema.parse(
    await devinRequest(sessionPath(`/${encodeURIComponent(sessionId)}/archive`), {
      method: 'POST',
    }),
  )
  return mapSession(raw)
}

export async function terminateDevinSession(sessionId: string): Promise<DevinSession> {
  const config = requireDevinConfig()
  const betaUrl = config.devinBaseUrl.replace(/\/v3$/, '/v3beta1')
  const path = `/organizations/${encodeURIComponent(config.devinOrgId)}/sessions/${encodeURIComponent(sessionId)}?archive=true`

  const response = await fetch(`${betaUrl}${path}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${config.devinApiToken}`,
      'Content-Type': 'application/json',
    },
  })
  const body = await response.text()
  if (!response.ok) {
    throw new DevinApiError(`Devin API returned ${response.status}`, response.status, body)
  }

  return mapSession(RawSessionSchema.parse(JSON.parse(body)))
}
