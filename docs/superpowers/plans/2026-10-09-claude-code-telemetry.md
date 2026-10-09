# Claude Code Telemetry Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-user web app that ingests Claude Code OTLP metrics and events into Postgres and shows a debugging/cost dashboard, run with `docker compose up`.

**Architecture:** One Fastify (TypeScript) service exposes OTLP/HTTP JSON ingest, a read-only JSON API, and the built React SPA on port 4318. Pure parser functions turn OTLP JSON into rows; SQL does all aggregation. Postgres is the only store.

**Tech Stack:** Node 22, TypeScript, Fastify, `pg`, node-pg-migrate, zod, Vitest, Testcontainers (Postgres), React, Vite, Recharts, TanStack Query, Docker Compose, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-09-claude-code-telemetry-design.md`

## Global Constraints

- Single port 4318, published as `127.0.0.1:4318` only.
- Postgres 16; `app` waits for the Postgres healthcheck (`depends_on: condition: service_healthy`); both services `restart: unless-stopped`; migrations run at app startup.
- OTLP protocol is `http/json`; gzip request bodies must be accepted; success response is `{}` with 200; malformed JSON -> 400; DB failure -> 503.
- Prompt text is never stored: drop the `prompt` attribute from `user_prompt` events before insert.
- Unknown metric/event names are stored, not rejected.
- No auth, no retention, no alerting, no TimescaleDB, no browser E2E.
- Dashboard time ranges: 1h, 24h, 7d, 30d; polling every 10s.
- Query params validated with zod -> 400 with `{error}` JSON.

## Review Focus

- OTLP `asInt` / `intValue` arrive as **strings** in JSON: must parse to numbers (Task 3, 4).
- Event names may carry a `claude_code.` prefix: normalize to `api_request`, `tool_result`, etc. (Task 3).
- Payloads with empty `resourceLogs`/`resourceMetrics` or missing `attributes` must return 200 with zero rows, not 500 (Task 5).
- Redelivered identical payload must not duplicate rows (Task 5).
- Empty database: every API endpoint returns zeros/empty lists, and UI shows the setup snippet (Task 6, 7).

---

## File Structure

```
package.json                      # workspaces: server, web
docker-compose.yml
Dockerfile                        # multi-stage: build web + server, run server
README.md                         # setup + Claude Code env snippet
scripts/send-sample.ts            # posts sample OTLP payloads
server/package.json, tsconfig.json, vitest.config.ts
server/migrations/001_init.sql
server/src/main.ts                # boot: migrate, build app, listen
server/src/app.ts                 # buildApp(pool): Fastify instance
server/src/config.ts              # env parsing
server/src/db/pool.ts, migrate.ts
server/src/ingest/otlp.ts         # attribute/value helpers
server/src/ingest/logs.ts         # parseLogs
server/src/ingest/metrics.ts      # parseMetrics
server/src/ingest/store.ts        # insertEvents, insertMetricPoints
server/src/ingest/routes.ts       # POST /v1/logs, /v1/metrics
server/src/api/query.ts           # zod range schema + time helpers
server/src/api/overview.ts, sessions.ts, tools.ts, errors.ts
server/test/**                    # mirrors src
server/test/helpers/db.ts         # Testcontainers Postgres + migrate
server/test/fixtures/*.json       # sample OTLP payloads
web/                              # Vite React app (src/pages, src/api, src/components)
```

---

### Task 1: Scaffold, Compose, and health endpoint

**Files:**
- Create: root `package.json`, `docker-compose.yml`, `Dockerfile`, `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/src/config.ts`, `server/src/app.ts`, `server/src/main.ts`, `server/src/db/pool.ts`
- Test: `server/test/health.test.ts`

**Interfaces:**
- Produces: `buildApp(pool: Pool): FastifyInstance` in `app.ts`; `getConfig(): { databaseUrl: string; port: number }` in `config.ts` (defaults: port 4318, `DATABASE_URL` required); `createPool(url: string): Pool` in `db/pool.ts`.

- [ ] **Step 1: Write failing test** `health.test.ts`: `buildApp(fakePool)` where `fakePool.query` resolves `{rows:[{ok:1}]}`; `GET /healthz` expects 200 `{status:"ok"}`; with `fakePool.query` rejecting, expects 503.
- [ ] **Step 2: Run** `npm -w server test -- health` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `buildApp` with `/healthz` doing `SELECT 1`; `main.ts` calls `getConfig`, `createPool`, `buildApp`, listens on `0.0.0.0` (the container-internal bind; host exposure is limited by Compose).
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Compose** — `postgres:16` with named volume and `pg_isready` healthcheck; `app` builds from `Dockerfile`, `ports: ["127.0.0.1:4318:4318"]`, `DATABASE_URL` env, `depends_on` healthy. Verify later in Task 8 with the full stack.
- [ ] **Step 6: Commit** `feat: scaffold server, compose, healthz`

### Task 2: Schema migration and DB test harness

**Files:**
- Create: `server/migrations/001_init.sql`, `server/src/db/migrate.ts`, `server/test/helpers/db.ts`
- Modify: `server/src/main.ts` (run migrations before listen)
- Test: `server/test/db/schema.test.ts`

**Interfaces:**
- Produces: `runMigrations(databaseUrl: string): Promise<void>`; test helper `startTestDb(): Promise<{ pool: Pool; stop(): Promise<void> }>` (Testcontainers Postgres 16, migrated).

- [ ] **Step 1: Write failing test**: using `startTestDb`, assert tables `metric_points`, `events`, view `sessions` exist; assert inserting two `events` rows with identical `dedup_key` leaves one row via `ON CONFLICT (dedup_key) DO NOTHING`; assert `sessions` view aggregates `total_cost`, `tool_calls`, `errors` for 3 inserted events of one session.
- [ ] **Step 2: Run** `npm -w server test -- schema` — Expected: FAIL.
- [ ] **Step 3: Write `001_init.sql`** per spec data model. `events.dedup_key text UNIQUE NOT NULL`. Indexes: `metric_points(name, ts)`, `events(event_name, ts)`, `events(session_id, ts)`. `sessions` view: `session_id, started_at=min(ts), last_seen=max(ts), total_cost=sum(cost_usd), total_tokens=sum(input_tokens+output_tokens), tool_calls=count of tool_result, errors=count of api_error plus tool_result with success=false`. Implement `runMigrations` with node-pg-migrate programmatic API.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: postgres schema and migration runner`

### Task 3: OTLP logs/events parser

**Files:**
- Create: `server/src/ingest/otlp.ts`, `server/src/ingest/logs.ts`, `server/test/fixtures/logs.json`
- Test: `server/test/ingest/logs.test.ts`

**Interfaces:**
- Produces: `attrsToObject(attrs?: OtlpKeyValue[]): Record<string, string | number | boolean>` (int strings -> numbers); `type EventRow = { ts: Date; eventName: string; sessionId: string | null; promptId: string | null; model: string | null; toolName: string | null; durationMs: number | null; success: boolean | null; costUsd: number | null; inputTokens: number | null; outputTokens: number | null; error: string | null; attributes: Record<string, unknown>; dedupKey: string }`; `parseLogs(payload: unknown): EventRow[]`.

- [ ] **Step 1: Write failing tests**: (a) fixture with an `api_request` record yields `model`, `costUsd=0.012`, `inputTokens=100` (OTLP `intValue:"100"`) , `durationMs`; (b) `event.name = "claude_code.tool_result"` normalizes to `tool_result` with `toolName` and `success=true`; (c) `user_prompt` row has no `prompt` key in `attributes`; (d) empty `{}` payload and records without attributes return `[]`/rows without throwing; (e) same record parsed twice gives the same `dedupKey`, different bodies give different ones; (f) an unknown event name is kept.
- [ ] **Step 2: Run** `npm -w server test -- logs` — Expected: FAIL.
- [ ] **Step 3: Implement** `attrsToObject` and `parseLogs`. Walk `resourceLogs[].scopeLogs[].logRecords[]`; merge resource attributes under record attributes; read `event.name`, `session.id`, `prompt.id`, `model`, `tool_name`, `duration_ms`, `success`, `cost_usd`, `input_tokens`, `output_tokens`, `error`; `ts` from `event.timestamp` else `timeUnixNano`. `dedupKey` = sha256 of `ts|eventName|sessionId|JSON of sorted attributes`.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: parse OTLP logs into event rows`

### Task 4: OTLP metrics parser

**Files:**
- Create: `server/src/ingest/metrics.ts`, `server/test/fixtures/metrics.json`
- Test: `server/test/ingest/metrics.test.ts`

**Interfaces:**
- Consumes: `attrsToObject` from Task 3.
- Produces: `type MetricRow = { ts: Date; name: string; value: number; sessionId: string | null; model: string | null; tokenType: string | null; attributes: Record<string, unknown> }`; `parseMetrics(payload: unknown): MetricRow[]`.

- [ ] **Step 1: Write failing tests**: (a) `claude_code.token.usage` sum data point with `type=input`, `model` yields `tokenType="input"`; (b) `asInt:"42"` -> `value 42`, `asDouble:0.5` -> `0.5`; (c) gauge data points are also read; (d) empty payload -> `[]`; (e) unknown metric name kept.
- [ ] **Step 2: Run** `npm -w server test -- metrics` — Expected: FAIL.
- [ ] **Step 3: Implement** `parseMetrics` walking `resourceMetrics[].scopeMetrics[].metrics[]`, reading `sum.dataPoints` or `gauge.dataPoints`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: parse OTLP metrics into metric rows`

### Task 5: Ingest storage and HTTP routes

**Files:**
- Create: `server/src/ingest/store.ts`, `server/src/ingest/routes.ts`
- Modify: `server/src/app.ts` (register routes; gzip + JSON content-type parser)
- Test: `server/test/ingest/routes.test.ts`

**Interfaces:**
- Consumes: `parseLogs`, `parseMetrics`, `EventRow`, `MetricRow`, `startTestDb`.
- Produces: `insertEvents(pool: Pool, rows: EventRow[]): Promise<number>` (rows inserted; `ON CONFLICT (dedup_key) DO NOTHING`); `insertMetricPoints(pool: Pool, rows: MetricRow[]): Promise<number>`; `POST /v1/logs`, `POST /v1/metrics`.

- [ ] **Step 1: Write failing tests** (real DB): (a) POST logs fixture -> 200 body `{}` and rows in `events`; (b) POST same payload twice -> row count unchanged; (c) gzip-encoded body accepted; (d) invalid JSON body -> 400; (e) `{}` payload -> 200, zero rows; (f) app built with a pool whose `query` rejects -> 503; (g) POST metrics fixture -> rows in `metric_points`.
- [ ] **Step 2: Run** `npm -w server test -- routes` — Expected: FAIL.
- [ ] **Step 3: Implement** batch inserts (single multi-row `INSERT` per request) and routes; handle gzip via `Content-Encoding` (Node `zlib`); map parse/JSON errors to 400, `pg` errors to 503.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: OTLP ingest endpoints with dedup`

### Task 6: Read-only API

**Files:**
- Create: `server/src/api/query.ts`, `overview.ts`, `sessions.ts`, `tools.ts`, `errors.ts`
- Modify: `server/src/app.ts` (register `/api/*`)
- Test: `server/test/api/*.test.ts`

**Interfaces:**
- Consumes: `startTestDb`, `insertEvents`, `insertMetricPoints`.
- Produces: zod `rangeSchema` (`from`, `to` ISO strings, optional `model`, optional `bucket: "hour" | "day"`, optional `limit`/`offset`); responses:
  - `GET /api/overview` -> `{ totals: { costUsd, inputTokens, outputTokens, sessions, toolCalls, errorRate }, series: { ts, costUsd, tokens }[], byModel: { model, costUsd }[] }`
  - `GET /api/sessions` -> `{ items: SessionRow[], total }`; `GET /api/sessions/:id` -> `{ session, events: EventRow-like[] }` (404 if unknown)
  - `GET /api/tools` -> `{ tools: { toolName, calls, successRate, p50Ms, p95Ms }[], slowest: {...}[] }`
  - `GET /api/errors` -> `{ items: { ts, kind, message, model, sessionId }[], total }`

- [ ] **Step 1: Write failing tests** seeded with known events: overview totals/series/byModel values; sessions ordering and pagination; session timeline ordered by `ts`, 404 for unknown id; tools `successRate` and p50/p95 on known durations; errors include both `api_error` and failed `tool_result`; invalid `from` -> 400 `{error}`; **empty DB** -> zeros / empty lists for every endpoint; `model` filter applied.
- [ ] **Step 2: Run** `npm -w server test -- api` — Expected: FAIL.
- [ ] **Step 3: Implement** endpoints with SQL aggregation (`date_trunc`, `percentile_cont`), parameterized queries only.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: dashboard read API`

### Task 7: Web app shell and Overview page

**Files:**
- Create: `web/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/api/client.ts`, `src/components/{RangePicker,StatCard,EmptyState,ErrorState}.tsx`, `src/lib/format.ts`, `src/pages/Overview.tsx`
- Modify: `server/src/app.ts` (serve `web/dist` via `@fastify/static` with SPA fallback for non-`/api`, non-`/v1` paths)
- Test: `web/src/lib/format.test.ts`

**Interfaces:**
- Consumes: `/api/overview` response shape from Task 6.
- Produces: `formatCost(n: number): string`, `formatTokens(n: number): string`, `formatDuration(ms: number): string`, `rangeToParams(range: "1h"|"24h"|"7d"|"30d", now?: Date): { from: string; to: string; bucket: "hour" | "day" }`; `api.get<T>(path, params)` using TanStack Query with `refetchInterval: 10_000`.

- [ ] **Step 1: Write failing tests** for the format helpers and `rangeToParams` (1h -> hour bucket, 30d -> day bucket; `from` precedes `to` by exactly the range).
- [ ] **Step 2: Run** `npm -w web test` — Expected: FAIL.
- [ ] **Step 3: Implement** helpers, shell with routes `/`, `/sessions`, `/sessions/:id`, `/tools`, `/errors`, and Overview (stat cards, cost/token line charts, cost-by-model bar chart); loading, error, and empty states, where empty shows the Claude Code env snippet from the spec.
- [ ] **Step 4: Run** tests — Expected: PASS; then `npm -w web run build` succeeds.
- [ ] **Step 5: Commit** `feat: web shell and overview page`

### Task 8: Sessions, Tools, Errors pages and Docker image

**Files:**
- Create: `web/src/pages/{Sessions,SessionDetail,Tools,Errors}.tsx`, `web/src/components/Timeline.tsx`
- Modify: `Dockerfile` (finalize multi-stage build)
- Test: manual compose verification (Task 9)

**Interfaces:**
- Consumes: `/api/sessions`, `/api/sessions/:id`, `/api/tools`, `/api/errors`; `formatCost`, `formatDuration`.

- [ ] **Step 1: Implement** Sessions table (sort by cost or recency, click to detail); SessionDetail with `Timeline` of API requests and tool calls with duration bars and error rows highlighted; Tools table plus slowest-calls list; Errors feed with session links. All use loading/empty/error components.
- [ ] **Step 2: Build** `docker compose build` — Expected: succeeds.
- [ ] **Step 3: Commit** `feat: sessions, tools, errors pages and image build`

### Task 9: Smoke script, README, end-to-end verification

**Files:**
- Create: `scripts/send-sample.ts`, `README.md`

**Interfaces:**
- Consumes: sample fixtures from `server/test/fixtures`.
- Produces: `npx tsx scripts/send-sample.ts [baseUrl]` posts logs + metrics to `http://127.0.0.1:4318` by default and exits non-zero on non-200.

- [ ] **Step 1: Implement** the script and a README with `docker compose up -d`, the Claude Code env snippet, and how to run tests.
- [ ] **Step 2: Verify** `docker compose up -d --build`; `curl -f http://127.0.0.1:4318/healthz` -> `{"status":"ok"}`; run the script -> exit 0; `curl http://127.0.0.1:4318/api/overview` shows nonzero totals; open `http://127.0.0.1:4318` and confirm all four pages render with data.
- [ ] **Step 3: Verify** `docker compose down && docker compose up -d` retains data (named volume) and `docker compose ps` shows both services running.
- [ ] **Step 4: Run** full suite `npm test` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat: smoke script and docs`
