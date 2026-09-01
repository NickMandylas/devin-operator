import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getRepositoryConfigs } from "./config";
import {
  findIssueSession,
  listDevinSessions,
  messageIssueSession,
  startIssueSession,
  terminateIssueSession,
} from "./automation";
import { hasWritePermission } from "./github-client";

const ActorSchema = z.object({ login: z.string() });
const RepositorySchema = z.object({ full_name: z.string() });
const IssuesWebhookSchema = z.object({
  action: z.string(),
  issue: z.object({ number: z.number() }),
  label: z.object({ name: z.string() }).nullable().optional(),
  repository: RepositorySchema,
  sender: ActorSchema,
});

const CommentWebhookSchema = z.object({
  action: z.string(),
  issue: z.object({ number: z.number() }),
  comment: z.object({ body: z.string() }),
  repository: RepositorySchema,
  sender: ActorSchema,
});

export function verifyGitHubSignature(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function assertTrustedActor(
  username: string,
  repository: string,
): Promise<void> {
  if (!(await hasWritePermission(username, repository))) {
    throw new Error(`GitHub user ${username} does not have write permission`);
  }
}

export async function handleGitHubWebhook(event: string, payload: unknown) {
  if (event === "ping") return { handled: true, message: "pong" };

  if (event === "issues") {
    const data = IssuesWebhookSchema.parse(payload);
    const repository = data.repository.full_name;
    if (
      !getRepositoryConfigs().some((entry) => entry.repository === repository)
    ) {
      return {
        handled: false,
        message: "Ignored event from another repository",
      };
    }
    if (data.action !== "labeled" || data.label?.name !== "devin-ready") {
      return { handled: false, message: "Issue event did not request Devin" };
    }

    await assertTrustedActor(data.sender.login, repository);
    const session = await startIssueSession(data.issue.number, {}, repository);
    return {
      handled: true,
      message: `Started ${session.sessionId}`,
      sessionId: session.sessionId,
    };
  }

  if (event === "issue_comment") {
    const data = CommentWebhookSchema.parse(payload);
    const repository = data.repository.full_name;
    if (
      !getRepositoryConfigs().some(
        (entry) => entry.repository === repository,
      ) ||
      data.action !== "created"
    ) {
      return { handled: false, message: "Ignored comment event" };
    }

    const command = data.comment.body.trim();
    if (!command.toLowerCase().startsWith("/devin")) {
      return { handled: false, message: "Comment is not a Devin command" };
    }

    await assertTrustedActor(data.sender.login, repository);
    const instruction = command.slice("/devin".length).trim();
    if (!instruction || instruction.toLowerCase() === "start") {
      const session = await startIssueSession(
        data.issue.number,
        {},
        repository,
      );
      return {
        handled: true,
        message: `Started ${session.sessionId}`,
        sessionId: session.sessionId,
      };
    }
    if (instruction.toLowerCase() === "retry") {
      const session = await startIssueSession(
        data.issue.number,
        { force: true },
        repository,
      );
      return {
        handled: true,
        message: `Started ${session.sessionId}`,
        sessionId: session.sessionId,
      };
    }

    const sessions = await listDevinSessions();
    const session = findIssueSession(repository, data.issue.number, sessions);
    if (!session)
      throw new Error(
        `No Devin session exists for issue #${data.issue.number}`,
      );

    if (instruction.toLowerCase() === "stop") {
      await terminateIssueSession(session.sessionId);
      return {
        handled: true,
        message: `Terminated ${session.sessionId}`,
        sessionId: session.sessionId,
      };
    }

    await messageIssueSession(session.sessionId, instruction);
    return {
      handled: true,
      message: `Messaged ${session.sessionId}`,
      sessionId: session.sessionId,
    };
  }

  return { handled: false, message: `Unsupported event: ${event}` };
}
