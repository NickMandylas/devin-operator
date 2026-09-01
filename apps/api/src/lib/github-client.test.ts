import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_LABELS } from "./config";
import { ensureAutomationLabels } from "./github-client";

const ALL_LABELS = Object.values(AUTOMATION_LABELS);

const originalToken = process.env.GITHUB_TOKEN;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function repoLabel(label: { name: string; color: string; description: string }) {
  return { name: label.name, color: label.color, description: label.description };
}

interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

function recordCall(input: RequestInfo | URL, init?: RequestInit): RecordedCall {
  const url = new URL(String(input));
  return {
    method: init?.method ?? "GET",
    path: `${url.pathname}${url.search}`,
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  };
}

describe("ensureAutomationLabels", () => {
  const calls: RecordedCall[] = [];

  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
    calls.length = 0;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
    vi.unstubAllGlobals();
  });

  function stubFetch(
    handler: (call: RecordedCall) => Response | Promise<Response>,
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const call = recordCall(input, init);
        calls.push(call);
        return handler(call);
      }),
    );
  }

  it("creates labels that are missing from the repository", async () => {
    stubFetch((call) => {
      if (call.method === "GET") return jsonResponse(200, []);
      if (call.method === "POST") return jsonResponse(201, call.body);
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });

    await ensureAutomationLabels();

    const creates = calls.filter((call) => call.method === "POST");
    expect(creates).toHaveLength(ALL_LABELS.length);
    expect(creates.map((call) => (call.body as { name: string }).name)).toEqual(
      ALL_LABELS.map((label) => label.name),
    );
  });

  it("updates labels via PATCH when color or description differ", async () => {
    const stale = ALL_LABELS.map((label, index) =>
      index === 0
        ? { ...repoLabel(label), color: "000000" }
        : repoLabel(label),
    );

    stubFetch((call) => {
      if (call.method === "GET") return jsonResponse(200, stale);
      if (call.method === "PATCH") return jsonResponse(200, call.body);
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });

    await ensureAutomationLabels();

    const updates = calls.filter((call) => call.method === "PATCH");
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toContain(
      `/labels/${encodeURIComponent(ALL_LABELS[0].name)}`,
    );
    expect(updates[0].body).toMatchObject({
      new_name: ALL_LABELS[0].name,
      color: ALL_LABELS[0].color,
    });
  });

  it("skips writes entirely when all labels already match", async () => {
    stubFetch((call) => {
      if (call.method === "GET")
        return jsonResponse(200, ALL_LABELS.map(repoLabel));
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });

    await ensureAutomationLabels();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
  });

  it("recovers from an already_exists race by updating instead", async () => {
    stubFetch((call) => {
      if (call.method === "GET") return jsonResponse(200, []);
      if (call.method === "POST")
        return jsonResponse(422, {
          message: "Validation Failed",
          errors: [
            { resource: "Label", code: "already_exists", field: "name" },
          ],
        });
      if (call.method === "PATCH") return jsonResponse(200, call.body);
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });

    await ensureAutomationLabels();

    const updates = calls.filter((call) => call.method === "PATCH");
    expect(updates).toHaveLength(ALL_LABELS.length);
  });

  it("propagates non-race create failures", async () => {
    stubFetch((call) => {
      if (call.method === "GET") return jsonResponse(200, []);
      if (call.method === "POST")
        return jsonResponse(403, { message: "Forbidden" });
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });

    await expect(ensureAutomationLabels()).rejects.toThrow(
      "GitHub API returned 403",
    );
  });
});
