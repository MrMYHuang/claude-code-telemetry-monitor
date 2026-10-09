import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { startTestDb } from '../helpers/db.js';
import { buildApp } from '../../src/app.js';
import { insertEvents } from '../../src/ingest/store.js';

describe('GET /api/overview', () => {
  let db: { pool: Pool; stop(): Promise<void> };
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    db = await startTestDb();
    app = buildApp(db.pool);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (db) {
      await db.stop();
    }
  });

  beforeEach(async () => {
    await db.pool.query('TRUNCATE events, metric_points;');
  });

  it('returns valid empty structure with zeros and empty arrays on empty database', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/overview',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      totals: {
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        sessions: 0,
        toolCalls: 0,
        errorRate: 0,
      },
      series: [],
      byModel: [],
    });
  });

  it('returns 400 with { error } on invalid from parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/overview?from=not-a-valid-date',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
  });

  it('calculates totals, series, and byModel accurately from seeded events', async () => {
    const events = [
      // API requests:
      {
        ts: new Date('2026-10-09T10:00:00.000Z'),
        eventName: 'api_request',
        sessionId: 'sess-1',
        promptId: null,
        model: 'claude-3-5-sonnet',
        toolName: null,
        durationMs: 500,
        success: true,
        costUsd: 0.05,
        inputTokens: 100,
        outputTokens: 50,
        error: null,
        attributes: {},
        dedupKey: 'k-1',
      },
      {
        ts: new Date('2026-10-09T10:30:00.000Z'),
        eventName: 'api_request',
        sessionId: 'sess-1',
        promptId: null,
        model: 'claude-3-5-sonnet',
        toolName: null,
        durationMs: 400,
        success: true,
        costUsd: 0.03,
        inputTokens: 60,
        outputTokens: 40,
        error: null,
        attributes: {},
        dedupKey: 'k-2',
      },
      {
        ts: new Date('2026-10-09T11:15:00.000Z'),
        eventName: 'api_request',
        sessionId: 'sess-2',
        promptId: null,
        model: 'claude-3-haiku',
        toolName: null,
        durationMs: 200,
        success: true,
        costUsd: 0.02,
        inputTokens: 40,
        outputTokens: 20,
        error: null,
        attributes: {},
        dedupKey: 'k-3',
      },
      // Tool results:
      {
        ts: new Date('2026-10-09T10:05:00.000Z'),
        eventName: 'tool_result',
        sessionId: 'sess-1',
        promptId: null,
        model: null,
        toolName: 'Bash',
        durationMs: 50,
        success: true,
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        error: null,
        attributes: {},
        dedupKey: 'k-4',
      },
      {
        ts: new Date('2026-10-09T10:20:00.000Z'),
        eventName: 'tool_result',
        sessionId: 'sess-1',
        promptId: null,
        model: null,
        toolName: 'Bash',
        durationMs: 80,
        success: false,
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        error: 'Command exited with 1',
        attributes: {},
        dedupKey: 'k-5',
      },
      // API error:
      {
        ts: new Date('2026-10-09T11:20:00.000Z'),
        eventName: 'api_error',
        sessionId: 'sess-2',
        promptId: null,
        model: 'claude-3-haiku',
        toolName: null,
        durationMs: 100,
        success: false,
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        error: 'Rate limit exceeded',
        attributes: {},
        dedupKey: 'k-6',
      },
    ];

    await insertEvents(db.pool, events);

    const res = await app.inject({
      method: 'GET',
      url: '/api/overview?bucket=hour',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Verify totals
    expect(body.totals.costUsd).toBeCloseTo(0.1, 5);
    expect(body.totals.inputTokens).toBe(200);
    expect(body.totals.outputTokens).toBe(110);
    expect(body.totals.sessions).toBe(2);
    expect(body.totals.toolCalls).toBe(2);
    // 2 errors out of 6 total events = 1/3
    expect(body.totals.errorRate).toBeCloseTo(2 / 6, 4);

    // Verify series: 2 buckets (10:00 and 11:00)
    expect(body.series).toHaveLength(2);
    expect(body.series[0].costUsd).toBeCloseTo(0.08, 5);
    expect(body.series[0].tokens).toBe(250); // 100+50 + 60+40
    expect(body.series[1].costUsd).toBeCloseTo(0.02, 5);
    expect(body.series[1].tokens).toBe(60); // 40+20

    // Verify byModel:
    expect(body.byModel).toHaveLength(2);
    const sonnet = body.byModel.find((m: any) => m.model === 'claude-3-5-sonnet');
    const haiku = body.byModel.find((m: any) => m.model === 'claude-3-haiku');
    expect(sonnet).toBeDefined();
    expect(sonnet.costUsd).toBeCloseTo(0.08, 5);
    expect(haiku).toBeDefined();
    expect(haiku.costUsd).toBeCloseTo(0.02, 5);
  });

  it('filters overview by model parameter', async () => {
    const events = [
      {
        ts: new Date('2026-10-09T10:00:00.000Z'),
        eventName: 'api_request',
        sessionId: 'sess-1',
        promptId: null,
        model: 'claude-3-5-sonnet',
        toolName: null,
        durationMs: 500,
        success: true,
        costUsd: 0.05,
        inputTokens: 100,
        outputTokens: 50,
        error: null,
        attributes: {},
        dedupKey: 'k-1',
      },
      {
        ts: new Date('2026-10-09T11:00:00.000Z'),
        eventName: 'api_request',
        sessionId: 'sess-2',
        promptId: null,
        model: 'claude-3-haiku',
        toolName: null,
        durationMs: 200,
        success: true,
        costUsd: 0.02,
        inputTokens: 40,
        outputTokens: 20,
        error: null,
        attributes: {},
        dedupKey: 'k-2',
      },
    ];

    await insertEvents(db.pool, events);

    const res = await app.inject({
      method: 'GET',
      url: '/api/overview?model=claude-3-5-sonnet',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals.costUsd).toBeCloseTo(0.05, 5);
    expect(body.totals.inputTokens).toBe(100);
    expect(body.totals.sessions).toBe(1);
    expect(body.byModel).toHaveLength(1);
    expect(body.byModel[0].model).toBe('claude-3-5-sonnet');
  });

  it('filters overview by time range (from/to)', async () => {
    const events = [
      {
        ts: new Date('2026-10-09T08:00:00.000Z'),
        eventName: 'api_request',
        sessionId: 'sess-old',
        promptId: null,
        model: 'claude-3-5-sonnet',
        toolName: null,
        durationMs: 500,
        success: true,
        costUsd: 0.10,
        inputTokens: 500,
        outputTokens: 250,
        error: null,
        attributes: {},
        dedupKey: 'k-1',
      },
      {
        ts: new Date('2026-10-09T10:00:00.000Z'),
        eventName: 'api_request',
        sessionId: 'sess-in-range',
        promptId: null,
        model: 'claude-3-5-sonnet',
        toolName: null,
        durationMs: 500,
        success: true,
        costUsd: 0.05,
        inputTokens: 100,
        outputTokens: 50,
        error: null,
        attributes: {},
        dedupKey: 'k-2',
      },
    ];

    await insertEvents(db.pool, events);

    const res = await app.inject({
      method: 'GET',
      url: '/api/overview?from=2026-10-09T09:00:00.000Z&to=2026-10-09T12:00:00.000Z',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals.costUsd).toBeCloseTo(0.05, 5);
    expect(body.totals.inputTokens).toBe(100);
    expect(body.totals.sessions).toBe(1);
  });
});
