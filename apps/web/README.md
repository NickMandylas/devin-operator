# Remediation control plane

The operator interface for the Devin remediation automation. It is a Next.js 16 App Router application built from the shadcn/ui `radix-mira` preset and the `dashboard-01` block, with Cognition branding, a multi-repository workspace selector, Iconly curved icons, and Beautiful UI-inspired task rows, tool chips, status filters, and approval controls.

The browser talks only to this application's `/rpc` Route Handler. The handler forwards typed oRPC v2 calls to `apps/api` and adds the control-plane credential on the server.

## Run locally

```bash
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

The App Router workspace is split into dedicated pages:

- `/dashboard` for repository health and automation metrics
- `/dashboard/issues` for the tracked issue queue and launch controls
- `/dashboard/sessions` for Devin session management
- `/dashboard/pull-requests` for generated pull requests
- `/dashboard/configuration` for repository and integration readiness

## Environment

- `API_INTERNAL_URL`: origin of `apps/api`, defaulting to `http://localhost:3001`
- `API_CONTROL_PLANE_TOKEN`: must match the API `CONTROL_PLANE_TOKEN` in production

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```
