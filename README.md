# Claude Code Telemetry Monitor

A personal, single-user observability and telemetry monitor for [Claude Code](https://claude.ai/code). It receives Claude Code's OpenTelemetry (OTLP/HTTP JSON) logs and metrics, stores them in PostgreSQL, and serves an interactive dashboard.

## Features

- **Debugging & Observability**: Inspect detailed session timelines with API calls, tool calls, and error highlights.
- **Cost & Token Tracking**: Monitor prompt and completion token usage and USD costs across models.
- **Tool Metrics**: Track tool call volume, execution duration percentiles (p50/p95), and success rates.
- **Error Feed**: Real-time error feed with direct links to session execution traces.
- **Privacy-first**: Prompt text is never stored in the database.
- **Single Port**: The Fastify server ingests OTLP, serves the REST API, and hosts the built React SPA on a single port (`4318`).

---

## Quickstart

Start the PostgreSQL database and telemetry application using Docker Compose:

```bash
docker compose up -d
```

Verify that the stack is healthy:

```bash
curl -f http://127.0.0.1:4318/healthz
# {"status":"ok"}
```

Access the dashboard at [http://localhost:4318](http://localhost:4318).

---

## Claude Code Configuration

To send telemetry from Claude Code to this monitor, export the following environment variables in your shell before launching Claude Code:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

You can add these to your `~/.zshrc` or `~/.bashrc` to enable telemetry automatically in every Claude Code session.

---

## Smoke Test

To verify that the ingestion pipeline and dashboard are functioning properly without running a real Claude Code session, use the included sample sender script:

```bash
npx tsx scripts/send-sample.ts
```

You can optionally specify a target URL:

```bash
npx tsx scripts/send-sample.ts http://127.0.0.1:4318
```

This sends synthetic OTLP logs (`api_request`, `tool_result`, `api_error`, `tool_decision`, `user_prompt`) and metrics (`token.usage`, `cost.usage`, `session.count`, `lines_of_code.count`) and validates HTTP 200 responses.

---

## Dashboard Pages

Once data has been ingested, visit [http://localhost:4318](http://localhost:4318):

1. **Overview**: Metric summary cards (Cost, Input/Output Tokens, Sessions, Tool Calls, Error Rate), time-series token/cost trends, and cost distribution by model.
2. **Sessions**: Paginated, sortable list of sessions with duration, cost, token totals, tool calls, and error counts. Click any session to inspect its interactive chronological timeline.
3. **Tools**: Statistics for every tool (`bash`, `glob`, `grep`, `edit`, etc.) including call count, success rate, and p50/p95 execution duration, plus a table of slowest invocations.
4. **Errors**: Dedicated feed of API errors and tool failures with timestamps, model details, and direct session links.

Use the global time range filter (1h, 24h, 7d, 30d) in the header to adjust the window across all views.

---

## Development

The project is structured as an npm workspace with `server` (Fastify + node-pg-migrate) and `web` (React + Vite + Recharts + Tailwind CSS).

### Prerequisites

- Node.js >= 20
- Docker & Docker Compose (or a local PostgreSQL 16 instance)

### Installation

```bash
npm install
```

### Running Tests

Run the unit and integration test suites across all workspaces:

```bash
npm test
```

Or test individual workspaces:

```bash
npm -w server test
npm -w web test
```

### Building for Production

Compile both frontend and backend bundles:

```bash
npm run build
```

---

## Docker Management

- Stop services while preserving database data:
  ```bash
  docker compose down
  ```
- Restart services:
  ```bash
  docker compose up -d
  ```
- Teardown services and wipe the PostgreSQL volume:
  ```bash
  docker compose down -v
  ```
