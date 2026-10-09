#!/usr/bin/env tsx

/**
 * Smoke script to send sample OTLP logs and metrics to the telemetry receiver.
 *
 * Usage:
 *   npx tsx scripts/send-sample.ts [baseUrl]
 *   e.g. npx tsx scripts/send-sample.ts http://127.0.0.1:4318
 */

interface SendResult {
  endpoint: string;
  status: number;
  response: unknown;
  durationMs: number;
}

export function buildSamplePayloads(sessionId?: string) {
  const sid = sessionId || `smoke-${Date.now().toString(36)}`;
  const now = Date.now();
  const toNano = (ms: number): string => (BigInt(ms) * 1_000_000n).toString();

  const logsPayload = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'claude-code' } },
            { key: 'host.name', value: { stringValue: 'dev-machine' } },
          ],
        },
        scopeLogs: [
          {
            scope: {
              name: 'claude-code-telemetry',
              version: '1.0.0',
            },
            logRecords: [
              // 1. user_prompt
              {
                timeUnixNano: toNano(now - 30_000),
                attributes: [
                  { key: 'event.name', value: { stringValue: 'claude_code.user_prompt' } },
                  { key: 'session.id', value: { stringValue: sid } },
                  { key: 'prompt.id', value: { stringValue: `prompt-${sid}-1` } },
                  { key: 'prompt', value: { stringValue: 'Inspect repo structure and run smoke tests' } },
                ],
              },
              // 2. api_request (Sonnet)
              {
                timeUnixNano: toNano(now - 25_000),
                attributes: [
                  { key: 'event.name', value: { stringValue: 'api_request' } },
                  { key: 'session.id', value: { stringValue: sid } },
                  { key: 'prompt.id', value: { stringValue: `prompt-${sid}-1` } },
                  { key: 'model', value: { stringValue: 'claude-3-5-sonnet-20241022' } },
                  { key: 'cost_usd', value: { doubleValue: 0.0145 } },
                  { key: 'input_tokens', value: { intValue: '1250' } },
                  { key: 'output_tokens', value: { intValue: '380' } },
                  { key: 'duration_ms', value: { doubleValue: 1420.5 } },
                  { key: 'event.timestamp', value: { stringValue: new Date(now - 25_000).toISOString() } },
                ],
              },
              // 3. tool_decision
              {
                timeUnixNano: toNano(now - 22_000),
                attributes: [
                  { key: 'event.name', value: { stringValue: 'tool_decision' } },
                  { key: 'session.id', value: { stringValue: sid } },
                  { key: 'tool_name', value: { stringValue: 'bash' } },
                  { key: 'duration_ms', value: { doubleValue: 12.0 } },
                  { key: 'event.timestamp', value: { stringValue: new Date(now - 22_000).toISOString() } },
                ],
              },
              // 4. tool_result (success)
              {
                timeUnixNano: toNano(now - 20_000),
                attributes: [
                  { key: 'event.name', value: { stringValue: 'claude_code.tool_result' } },
                  { key: 'session.id', value: { stringValue: sid } },
                  { key: 'tool_name', value: { stringValue: 'bash' } },
                  { key: 'success', value: { boolValue: true } },
                  { key: 'duration_ms', value: { doubleValue: 285.4 } },
                  { key: 'event.timestamp', value: { stringValue: new Date(now - 20_000).toISOString() } },
                ],
              },
              // 5. tool_result (failure)
              {
                timeUnixNano: toNano(now - 15_000),
                attributes: [
                  { key: 'event.name', value: { stringValue: 'claude_code.tool_result' } },
                  { key: 'session.id', value: { stringValue: sid } },
                  { key: 'tool_name', value: { stringValue: 'glob' } },
                  { key: 'success', value: { boolValue: false } },
                  { key: 'error', value: { stringValue: 'Directory not found: /var/log/nonexistent' } },
                  { key: 'duration_ms', value: { doubleValue: 42.1 } },
                  { key: 'event.timestamp', value: { stringValue: new Date(now - 15_000).toISOString() } },
                ],
              },
              // 6. api_error
              {
                timeUnixNano: toNano(now - 10_000),
                attributes: [
                  { key: 'event.name', value: { stringValue: 'api_error' } },
                  { key: 'session.id', value: { stringValue: sid } },
                  { key: 'model', value: { stringValue: 'claude-3-5-sonnet-20241022' } },
                  { key: 'error', value: { stringValue: 'Rate limit exceeded: 429 Too Many Requests' } },
                  { key: 'duration_ms', value: { doubleValue: 610.0 } },
                  { key: 'event.timestamp', value: { stringValue: new Date(now - 10_000).toISOString() } },
                ],
              },
              // 7. api_request (Haiku)
              {
                timeUnixNano: toNano(now - 5_000),
                attributes: [
                  { key: 'event.name', value: { stringValue: 'api_request' } },
                  { key: 'session.id', value: { stringValue: sid } },
                  { key: 'prompt.id', value: { stringValue: `prompt-${sid}-2` } },
                  { key: 'model', value: { stringValue: 'claude-3-5-haiku-20241022' } },
                  { key: 'cost_usd', value: { doubleValue: 0.0025 } },
                  { key: 'input_tokens', value: { intValue: '450' } },
                  { key: 'output_tokens', value: { intValue: '110' } },
                  { key: 'duration_ms', value: { doubleValue: 410.2 } },
                  { key: 'event.timestamp', value: { stringValue: new Date(now - 5_000).toISOString() } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const metricsPayload = {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'claude-code' } },
            { key: 'host.name', value: { stringValue: 'dev-machine' } },
          ],
        },
        scopeMetrics: [
          {
            scope: {
              name: 'claude-code-telemetry',
              version: '1.0.0',
            },
            metrics: [
              // 1. token usage (input + output for Sonnet & Haiku)
              {
                name: 'claude_code.token.usage',
                description: 'Total token usage by type and model',
                unit: '1',
                sum: {
                  dataPoints: [
                    {
                      timeUnixNano: toNano(now - 25_000),
                      asInt: '1250',
                      attributes: [
                        { key: 'type', value: { stringValue: 'input' } },
                        { key: 'model', value: { stringValue: 'claude-3-5-sonnet-20241022' } },
                        { key: 'session.id', value: { stringValue: sid } },
                      ],
                    },
                    {
                      timeUnixNano: toNano(now - 25_000),
                      asInt: '380',
                      attributes: [
                        { key: 'type', value: { stringValue: 'output' } },
                        { key: 'model', value: { stringValue: 'claude-3-5-sonnet-20241022' } },
                        { key: 'session.id', value: { stringValue: sid } },
                      ],
                    },
                    {
                      timeUnixNano: toNano(now - 5_000),
                      asInt: '450',
                      attributes: [
                        { key: 'type', value: { stringValue: 'input' } },
                        { key: 'model', value: { stringValue: 'claude-3-5-haiku-20241022' } },
                        { key: 'session.id', value: { stringValue: sid } },
                      ],
                    },
                    {
                      timeUnixNano: toNano(now - 5_000),
                      asInt: '110',
                      attributes: [
                        { key: 'type', value: { stringValue: 'output' } },
                        { key: 'model', value: { stringValue: 'claude-3-5-haiku-20241022' } },
                        { key: 'session.id', value: { stringValue: sid } },
                      ],
                    },
                  ],
                },
              },
              // 2. cost usage
              {
                name: 'claude_code.cost.usage',
                description: 'Cost usage in USD',
                unit: 'USD',
                gauge: {
                  dataPoints: [
                    {
                      timeUnixNano: toNano(now - 25_000),
                      asDouble: 0.0145,
                      attributes: [
                        { key: 'model', value: { stringValue: 'claude-3-5-sonnet-20241022' } },
                        { key: 'session_id', value: { stringValue: sid } },
                      ],
                    },
                    {
                      timeUnixNano: toNano(now - 5_000),
                      asDouble: 0.0025,
                      attributes: [
                        { key: 'model', value: { stringValue: 'claude-3-5-haiku-20241022' } },
                        { key: 'session_id', value: { stringValue: sid } },
                      ],
                    },
                  ],
                },
              },
              // 3. session count
              {
                name: 'claude_code.session.count',
                description: 'Session count',
                unit: '1',
                sum: {
                  dataPoints: [
                    {
                      timeUnixNano: toNano(now),
                      asInt: '1',
                      attributes: [
                        { key: 'session.id', value: { stringValue: sid } },
                      ],
                    },
                  ],
                },
              },
              // 4. lines of code count
              {
                name: 'claude_code.lines_of_code.count',
                description: 'Lines of code modified',
                unit: '1',
                sum: {
                  dataPoints: [
                    {
                      timeUnixNano: toNano(now),
                      asInt: '72',
                      attributes: [
                        { key: 'session.id', value: { stringValue: sid } },
                        { key: 'type', value: { stringValue: 'added' } },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  return { sessionId: sid, logsPayload, metricsPayload };
}

async function postOtlp(url: string, payload: unknown): Promise<SendResult> {
  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const durationMs = Date.now() - start;
  let responseBody: unknown;
  const text = await res.text();
  try {
    responseBody = text ? JSON.parse(text) : {};
  } catch {
    responseBody = text;
  }

  if (res.status !== 200) {
    throw new Error(
      `POST ${url} failed with HTTP ${res.status}: ${
        typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
      }`,
    );
  }

  // Validate response is `{}`
  if (
    typeof responseBody !== 'object' ||
    responseBody === null ||
    Array.isArray(responseBody) ||
    Object.keys(responseBody).length > 0
  ) {
    throw new Error(
      `POST ${url} returned unexpected response (expected empty object {}): ${JSON.stringify(responseBody)}`,
    );
  }

  return {
    endpoint: url,
    status: res.status,
    response: responseBody,
    durationMs,
  };
}

export async function runSmoke(baseUrlArg?: string): Promise<void> {
  const rawBaseUrl = baseUrlArg || process.env.BASE_URL || 'http://127.0.0.1:4318';
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');

  console.log(`[smoke] Target telemetry receiver: ${baseUrl}`);

  const { sessionId, logsPayload, metricsPayload } = buildSamplePayloads();
  console.log(`[smoke] Generated sample dataset for session: ${sessionId}`);

  // 1. Send logs
  const logsUrl = `${baseUrl}/v1/logs`;
  console.log(`[smoke] Sending POST ${logsUrl} (${logsPayload.resourceLogs[0].scopeLogs[0].logRecords.length} records)...`);
  const logsResult = await postOtlp(logsUrl, logsPayload);
  console.log(`[smoke] ✔ POST ${logsUrl} -> ${logsResult.status} OK in ${logsResult.durationMs}ms: {}`);

  // 2. Send metrics
  const metricsUrl = `${baseUrl}/v1/metrics`;
  console.log(`[smoke] Sending POST ${metricsUrl} (${metricsPayload.resourceMetrics[0].scopeMetrics[0].metrics.length} metrics)...`);
  const metricsResult = await postOtlp(metricsUrl, metricsPayload);
  console.log(`[smoke] ✔ POST ${metricsUrl} -> ${metricsResult.status} OK in ${metricsResult.durationMs}ms: {}`);

  console.log('\n[smoke] Summary:');
  console.log(`  - Session: ${sessionId}`);
  console.log('  - Events sent: api_request, tool_result (success & failure), api_error, tool_decision, user_prompt');
  console.log('  - Metrics sent: token usage (input/output), cost usage, session count, lines of code');
  console.log('  - Status: All endpoints responded with HTTP 200 {}\n');
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Execute when run directly
const isDirectRun =
  Boolean(process.argv[1]) &&
  (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('send-sample.ts') ||
    process.argv[1].endsWith('send-sample'));

if (isDirectRun) {
  const arg = process.argv[2];
  if (arg === '--help' || arg === '-h') {
    console.log(`
Claude Code Telemetry - Smoke Script
Sends sample OTLP logs and metrics to the telemetry receiver.

Usage:
  npx tsx scripts/send-sample.ts [baseUrl]

Options:
  baseUrl       Target URL (default: http://127.0.0.1:4318 or BASE_URL env)
  -h, --help    Show this help message

Examples:
  npx tsx scripts/send-sample.ts
  npx tsx scripts/send-sample.ts http://127.0.0.1:4318
  npx tsx scripts/send-sample.ts http://localhost:4318
`);
    process.exit(0);
  }

  runSmoke(arg).catch((err) => {
    console.error(`[smoke] ✖ Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
