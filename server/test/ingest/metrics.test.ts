import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseMetrics, type MetricRow } from '../../src/ingest/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const metricsFixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/metrics.json'), 'utf-8'),
);

describe('parseMetrics', () => {
  it('(a) claude_code.token.usage sum data point with type=input, model yields tokenType="input"', () => {
    const rows = parseMetrics(metricsFixture);
    const inputTokenRow = rows.find(
      (r) => r.name === 'claude_code.token.usage' && r.tokenType === 'input',
    );
    expect(inputTokenRow).toBeDefined();
    expect(inputTokenRow?.name).toBe('claude_code.token.usage');
    expect(inputTokenRow?.tokenType).toBe('input');
    expect(inputTokenRow?.model).toBe('claude-3-5-sonnet-20241022');
    expect(inputTokenRow?.value).toBe(42);
    expect(inputTokenRow?.sessionId).toBe('sess-001');
    expect(inputTokenRow?.ts).toEqual(new Date(1770638400000));
  });

  it('(b) asInt:"42" -> value 42, asDouble:0.5 -> 0.5', () => {
    const payload = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'test.int_metric',
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: '1770638400000000000',
                        asInt: '42',
                      },
                    ],
                  },
                },
                {
                  name: 'test.double_metric',
                  gauge: {
                    dataPoints: [
                      {
                        timeUnixNano: '1770638400000000000',
                        asDouble: 0.5,
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

    const rows = parseMetrics(payload);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('test.int_metric');
    expect(rows[0].value).toBe(42);
    expect(rows[1].name).toBe('test.double_metric');
    expect(rows[1].value).toBe(0.5);
  });

  it('(c) gauge data points are also read', () => {
    const rows = parseMetrics(metricsFixture);
    const costRow = rows.find((r) => r.name === 'claude_code.cost.usage');
    expect(costRow).toBeDefined();
    expect(costRow?.name).toBe('claude_code.cost.usage');
    expect(costRow?.value).toBe(0.5);
    expect(costRow?.model).toBe('claude-3-5-sonnet-20241022');
    expect(costRow?.sessionId).toBe('sess-001');
  });

  it('(d) empty payload -> []', () => {
    expect(parseMetrics({})).toEqual([]);
    expect(parseMetrics(null)).toEqual([]);
    expect(parseMetrics(undefined)).toEqual([]);
    expect(parseMetrics({ resourceMetrics: [] })).toEqual([]);
    expect(parseMetrics({ resourceMetrics: [{ scopeMetrics: [] }] })).toEqual([]);
    expect(
      parseMetrics({
        resourceMetrics: [{ scopeMetrics: [{ metrics: [] }] }],
      }),
    ).toEqual([]);
  });

  it('(e) unknown metric name kept', () => {
    const rows = parseMetrics(metricsFixture);
    const customRow = rows.find((r) => r.name === 'custom.queue_depth');
    expect(customRow).toBeDefined();
    expect(customRow?.name).toBe('custom.queue_depth');
    expect(customRow?.value).toBe(17.5);
    expect(customRow?.attributes['queue_name']).toBe('ingest_tasks');
  });

  it('merges resource attributes under data-point attributes with data-point overriding resource', () => {
    const payload = {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'claude-code' } },
              { key: 'session.id', value: { stringValue: 'res-session' } },
            ],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'test.metric',
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: '1770638400000000000',
                        asInt: '10',
                        attributes: [
                          { key: 'session.id', value: { stringValue: 'dp-session' } },
                          { key: 'custom.tag', value: { stringValue: 'dp-tag' } },
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

    const rows = parseMetrics(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe('dp-session');
    expect(rows[0].attributes['service.name']).toBe('claude-code');
    expect(rows[0].attributes['custom.tag']).toBe('dp-tag');
  });

  it('recognizes session_id attribute as sessionId fallback', () => {
    const payload = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'test.metric',
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: '1770638400000000000',
                        asInt: '5',
                        attributes: [
                          { key: 'session_id', value: { stringValue: 'sess-snake' } },
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

    const rows = parseMetrics(payload);
    expect(rows[0].sessionId).toBe('sess-snake');
  });

  it('does not confuse non-token type attribute with tokenType', () => {
    const rows = parseMetrics(metricsFixture);
    const locRow = rows.find((r) => r.name === 'claude_code.lines_of_code.count');
    expect(locRow).toBeDefined();
    expect(locRow?.tokenType).toBeNull();
    expect(locRow?.attributes['type']).toBe('added');
  });

  it('drops prompt free-text attributes for privacy', () => {
    const payload = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'test.metric',
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: '1770638400000000000',
                        asInt: '1',
                        attributes: [
                          { key: 'prompt', value: { stringValue: 'sensitive prompt text' } },
                          { key: 'prompt_text', value: { stringValue: 'more prompt text' } },
                          { key: 'model', value: { stringValue: 'claude-3-5-sonnet' } },
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

    const rows = parseMetrics(payload);
    expect(rows).toHaveLength(1);
    expect(rows[0].attributes).not.toHaveProperty('prompt');
    expect(rows[0].attributes).not.toHaveProperty('prompt_text');
    expect(JSON.stringify(rows[0])).not.toContain('sensitive prompt text');
    expect(JSON.stringify(rows[0])).not.toContain('more prompt text');
  });

  it('handles number representations safely without NaN or Invalid Date', () => {
    const payload = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'test.metric',
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: 'invalid_nano',
                        asInt: 42, // numeric asInt
                      },
                      {
                        timeUnixNano: '1770638400000000000',
                        asDouble: '3.14', // string asDouble
                      },
                      {
                        asInt: '0', // zero asInt string
                      },
                      {
                        asDouble: 0, // zero asDouble numeric
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

    const rows = parseMetrics(payload);
    expect(rows).toHaveLength(4);
    expect(rows[0].value).toBe(42);
    expect(Number.isNaN(rows[0].ts.getTime())).toBe(false);
    expect(rows[1].value).toBe(3.14);
    expect(rows[2].value).toBe(0);
    expect(rows[3].value).toBe(0);
  });

  it('skips data points without a valid finite value while keeping valid neighbours', () => {
    const payload = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'test.metric',
                  sum: {
                    dataPoints: [
                      {
                        // valueless data point (no asInt, no asDouble)
                        timeUnixNano: '1770638400000000000',
                      },
                      {
                        // valid neighbour
                        timeUnixNano: '1770638400000000000',
                        asInt: '10',
                      },
                      {
                        // asInt 'abc' unparseable
                        timeUnixNano: '1770638400000000000',
                        asInt: 'abc',
                      },
                      {
                        // asInt '' empty string
                        timeUnixNano: '1770638400000000000',
                        asInt: '',
                      },
                      {
                        // asDouble Infinity
                        timeUnixNano: '1770638400000000000',
                        asDouble: Infinity,
                      },
                      {
                        // asDouble '-Infinity' string
                        timeUnixNano: '1770638400000000000',
                        asDouble: '-Infinity',
                      },
                      {
                        // another valid neighbour
                        timeUnixNano: '1770638400000000000',
                        asDouble: 2.5,
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

    const rows = parseMetrics(payload);
    expect(rows).toHaveLength(2);
    expect(rows[0].value).toBe(10);
    expect(rows[1].value).toBe(2.5);
  });
});

