import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { attrsToObject } from '../../src/ingest/otlp.js';
import { parseLogs, type EventRow } from '../../src/ingest/logs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsFixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/logs.json'), 'utf-8'),
);

describe('attrsToObject', () => {
  it('converts int strings to numbers and preserves types', () => {
    const attrs = [
      { key: 'int_as_str', value: { intValue: '100' } },
      { key: 'int_as_num', value: { intValue: 42 } },
      { key: 'double_val', value: { doubleValue: 0.012 } },
      { key: 'str_val', value: { stringValue: 'claude-3-5-sonnet' } },
      { key: 'bool_val', value: { boolValue: true } },
    ];
    const res = attrsToObject(attrs);
    expect(res).toEqual({
      int_as_str: 100,
      int_as_num: 42,
      double_val: 0.012,
      str_val: 'claude-3-5-sonnet',
      bool_val: true,
    });
  });

  it('handles empty or undefined attributes without throwing', () => {
    expect(attrsToObject()).toEqual({});
    expect(attrsToObject([])).toEqual({});
    expect(attrsToObject(undefined)).toEqual({});
  });
});

describe('parseLogs', () => {
  it('(a) fixture with an api_request record yields model, costUsd=0.012, inputTokens=100 (OTLP intValue:"100"), durationMs', () => {
    const rows = parseLogs(logsFixture);
    const apiReq = rows.find((r) => r.eventName === 'api_request');
    expect(apiReq).toBeDefined();
    expect(apiReq?.model).toBe('claude-3-5-sonnet-20241022');
    expect(apiReq?.costUsd).toBe(0.012);
    expect(apiReq?.inputTokens).toBe(100);
    expect(apiReq?.outputTokens).toBe(50);
    expect(apiReq?.durationMs).toBe(1250.5);
    expect(apiReq?.sessionId).toBe('sess-001');
    expect(apiReq?.promptId).toBe('prompt-001');
    expect(apiReq?.ts).toEqual(new Date('2026-10-09T10:00:00.000Z'));
  });

  it('(b) event.name = "claude_code.tool_result" normalizes to tool_result with toolName and success=true', () => {
    const rows = parseLogs(logsFixture);
    const toolRes = rows.find((r) => r.eventName === 'tool_result');
    expect(toolRes).toBeDefined();
    expect(toolRes?.eventName).toBe('tool_result');
    expect(toolRes?.toolName).toBe('bash');
    expect(toolRes?.success).toBe(true);
    expect(toolRes?.durationMs).toBe(45.2);
  });

  it('(c) user_prompt row has no prompt key in attributes', () => {
    const rows = parseLogs(logsFixture);
    const userPrompt = rows.find((r) => r.eventName === 'user_prompt');
    expect(userPrompt).toBeDefined();
    expect(userPrompt?.eventName).toBe('user_prompt');
    expect(userPrompt?.attributes).not.toHaveProperty('prompt');
    expect(userPrompt?.promptId).toBe('prompt-001');
  });

  it('(d) empty {} payload and records without attributes return []/rows without throwing', () => {
    expect(parseLogs({})).toEqual([]);
    expect(parseLogs(null)).toEqual([]);
    expect(parseLogs(undefined)).toEqual([]);

    const payloadWithoutAttrs = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1770638400000000000',
                },
              ],
            },
          ],
        },
      ],
    };

    const rows = parseLogs(payloadWithoutAttrs);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.eventName).toBe('unknown');
    expect(row.sessionId).toBeNull();
    expect(row.promptId).toBeNull();
    expect(row.model).toBeNull();
    expect(row.toolName).toBeNull();
    expect(row.durationMs).toBeNull();
    expect(row.success).toBeNull();
    expect(row.costUsd).toBeNull();
    expect(row.inputTokens).toBeNull();
    expect(row.outputTokens).toBeNull();
    expect(row.error).toBeNull();
    expect(row.attributes).toEqual({});
    expect(typeof row.dedupKey).toBe('string');
    expect(row.dedupKey.length).toBe(64);
  });

  it('(e) same record parsed twice gives the same dedupKey, different bodies give different ones', () => {
    const rows1 = parseLogs(logsFixture);
    const rows2 = parseLogs(logsFixture);
    expect(rows1[0].dedupKey).toBe(rows2[0].dedupKey);

    const recordA = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1770638400000000000',
                  body: { stringValue: 'body-alpha' },
                  attributes: [
                    { key: 'event.name', value: { stringValue: 'tool_result' } },
                    { key: 'session.id', value: { stringValue: 'sess-1' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const recordB = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1770638400000000000',
                  body: { stringValue: 'body-beta' },
                  attributes: [
                    { key: 'event.name', value: { stringValue: 'tool_result' } },
                    { key: 'session.id', value: { stringValue: 'sess-1' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const parsedA = parseLogs(recordA);
    const parsedB = parseLogs(recordB);
    expect(parsedA[0].dedupKey).not.toBe(parsedB[0].dedupKey);

    // Dedup key is deterministic regardless of attribute order
    const recordC1 = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1770638400000000000',
                  attributes: [
                    { key: 'z_key', value: { stringValue: '1' } },
                    { key: 'a_key', value: { stringValue: '2' } },
                    { key: 'event.name', value: { stringValue: 'test' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const recordC2 = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1770638400000000000',
                  attributes: [
                    { key: 'a_key', value: { stringValue: '2' } },
                    { key: 'event.name', value: { stringValue: 'test' } },
                    { key: 'z_key', value: { stringValue: '1' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(parseLogs(recordC1)[0].dedupKey).toBe(parseLogs(recordC2)[0].dedupKey);
  });

  it('(f) an unknown event name is kept', () => {
    const rows = parseLogs(logsFixture);
    const customEvent = rows.find((r) => r.eventName === 'custom.experimental_event');
    expect(customEvent).toBeDefined();
    expect(customEvent?.eventName).toBe('custom.experimental_event');
    expect(customEvent?.attributes['custom_field']).toBe('val_123');
  });

  it('handles success as boolean and as string ("true"/"false")', () => {
    const payload = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1770638400000000000',
                  attributes: [
                    { key: 'event.name', value: { stringValue: 'tool_result' } },
                    { key: 'success', value: { stringValue: 'true' } },
                  ],
                },
                {
                  timeUnixNano: '1770638400000000000',
                  attributes: [
                    { key: 'event.name', value: { stringValue: 'tool_result' } },
                    { key: 'success', value: { stringValue: 'false' } },
                  ],
                },
                {
                  timeUnixNano: '1770638400000000000',
                  attributes: [
                    { key: 'event.name', value: { stringValue: 'tool_result' } },
                    { key: 'success', value: { boolValue: false } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const rows = parseLogs(payload);
    expect(rows[0].success).toBe(true);
    expect(rows[1].success).toBe(false);
    expect(rows[2].success).toBe(false);
  });

  it('merges resource attributes under record attributes, with record overriding resource', () => {
    const payload = {
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'session.id', value: { stringValue: 'resource-sess' } },
              { key: 'service.name', value: { stringValue: 'claude-code' } },
            ],
          },
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1770638400000000000',
                  attributes: [
                    { key: 'event.name', value: { stringValue: 'tool_result' } },
                    { key: 'session.id', value: { stringValue: 'record-sess' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const rows = parseLogs(payload);
    expect(rows[0].sessionId).toBe('record-sess');
    expect(rows[0].attributes['service.name']).toBe('claude-code');
  });

  it('computes ts from timeUnixNano when event.timestamp is absent', () => {
    const payload = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1700000000000000000',
                  attributes: [{ key: 'event.name', value: { stringValue: 'test' } }],
                },
              ],
            },
          ],
        },
      ],
    };

    const rows = parseLogs(payload);
    expect(rows[0].ts.getTime()).toBe(1700000000000);
  });
});
