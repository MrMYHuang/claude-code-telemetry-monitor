# Claude Code Telemetry Monitor — Design

Date: 2026-10-09

## Purpose and scope

A personal, single-user web system that receives Claude Code's OpenTelemetry export, stores it in Postgres, and shows a dashboard. Primary goal: debugging and observability (tool calls, API requests, errors, session timelines). Secondary goal: cost and token tracking.

- Stack: TypeScript, Postgres, Docker Compose.
- Signals: OTLP metrics and events/logs. Prompt text is NOT stored.
- Out of scope: auth, multi-user/team features, retention policy, alerting, prompt text, TimescaleDB, browser E2E tests.

## Architecture

```
Claude Code --OTLP/HTTP JSON--> app (Fastify, TS) --> Postgres
                                   |
Browser <-- React SPA (static) <---+  REST /api/*
```

Compose services:
- `postgres` (16, named volume, healthcheck).
- `app` (Node 22). Serves OTLP ingest (`POST /v1/metrics`, `POST /v1/logs`), the JSON API (`/api/*`), and the built SPA on one port, 4318, bound to `127.0.0.1`. Waits for Postgres health, runs migrations at startup, `restart: unless-stopped`.

Claude Code configuration:
```
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Repo layout: npm workspace with `server/` (`ingest/`, `db/`, `api/`), `web/`, `scripts/`, `docker-compose.yml`.

Units:
- `ingest/`: pure functions parsing OTLP JSON into rows.
- `db/`: migrations (node-pg-migrate, plain SQL) and typed queries.
- `api/`: read-only endpoints; aggregation done in SQL.
- `web/`: UI only, no direct DB access.

## Data model

Only normalized rows are stored; raw OTLP payloads are not kept.

- `metric_points`: `id`, `ts`, `name` (e.g. `claude_code.token.usage`, `claude_code.cost.usage`, `claude_code.session.count`, `claude_code.lines_of_code.count`), `value` (double), `session_id`, `model`, `token_type`, `attributes` (jsonb). Index `(name, ts)`.
- `events`: `id`, `ts`, `event_name` (`api_request`, `tool_result`, `api_error`, `user_prompt`, `tool_decision`), `session_id`, `prompt_id`, `attributes` (jsonb), nullable typed columns `model`, `tool_name`, `duration_ms`, `success`, `cost_usd`, `input_tokens`, `output_tokens`, `error`. Indexes `(event_name, ts)`, `(session_id, ts)`.
- `sessions`: SQL view over `events` (`session_id`, `started_at`, `last_seen`, `total_cost`, `total_tokens`, `tool_calls`, `errors`).
- Idempotency: unique key on `events` from `ts` + `event_name` + `session_id` + payload hash, with `ON CONFLICT DO NOTHING`, so OTLP retries don't duplicate rows.
- Privacy: prompt content fields are dropped by the ingester before storage.
- Unknown metric/event names are stored with generic fields plus `attributes`.

## API

All list/aggregate endpoints accept `from`, `to`, optional `model`.
- `GET /api/overview`: totals (cost, tokens by type, sessions, tool calls, error rate) and a time series bucketed by hour/day.
- `GET /api/sessions` (paginated), `GET /api/sessions/:id` (event timeline).
- `GET /api/tools`: per-tool count, success rate, p50/p95 duration.
- `GET /api/errors` (paginated): `api_error` events and failed `tool_result` events.
- `GET /healthz`.

## Dashboard (React + Vite, Recharts, TanStack Query)

Global time-range picker (1h, 24h, 7d, 30d); polling every 10s; no websockets.
1. Overview: stat cards, cost/token charts, cost by model.
2. Sessions: sortable table; row opens a timeline of API requests and tool calls with duration bars and highlighted errors.
3. Tools: per-tool stats and slowest calls.
4. Errors: feed with message, model, session link.

## Error handling

- Ingest: malformed JSON -> 400; DB failure -> 503 (exporter retries); gzip bodies supported; success returns `{}` with 200 per OTLP spec.
- API: query params validated with zod -> 400; errors as `{error}` JSON.
- Frontend: loading, empty, and error states; the empty state shows the Claude Code env snippet.

## Testing (Vitest)

- Unit: OTLP metrics/logs parsers using sample payloads, prompt-content stripping, dedup hash, formatting helpers.
- Integration: ingest then query against a real Postgres (Testcontainers or Compose DB); verify aggregates and idempotent redelivery.
- Smoke: `scripts/send-sample.ts` posts sample OTLP data to a running stack.
