import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { startTestDb } from '../helpers/db.js';
import { buildApp } from '../../src/app.js';
import { insertEvents } from '../../src/ingest/store.js';

describe('Tools API (GET /api/tools)', () => {
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

  it('returns valid empty structure on empty database', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tools',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      tools: [],
      slowest: [],
    });
  });

  it('returns 400 on invalid from parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tools?from=not-valid',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error');
  });

  it('calculates calls, successRate, p50Ms, p95Ms and slowest accurately', async () => {
    // Insert 10 Bash tool calls with durations 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
    // 8 success, 2 failed
    const bashEvents = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((duration, i) => ({
      ts: new Date(`2026-10-09T10:0${i}:00.000Z`),
      eventName: 'tool_result',
      sessionId: 'sess-tools-1',
      promptId: null,
      model: null,
      toolName: 'Bash',
      durationMs: duration,
      success: i < 8, // 8 success, 2 failure
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      error: i >= 8 ? 'Exit status 1' : null,
      attributes: {},
      dedupKey: `bash-k-${i}`,
    }));

    // Insert 2 FileRead tool calls with durations 5, 15, both success
    const fileReadEvents = [5, 15].map((duration, i) => ({
      ts: new Date(`2026-10-09T11:0${i}:00.000Z`),
      eventName: 'tool_result',
      sessionId: 'sess-tools-2',
      promptId: null,
      model: null,
      toolName: 'FileRead',
      durationMs: duration,
      success: true,
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      error: null,
      attributes: {},
      dedupKey: `fileread-k-${i}`,
    }));

    await insertEvents(db.pool, [...bashEvents, ...fileReadEvents]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/tools',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.tools).toHaveLength(2);

    const bash = body.tools.find((t: any) => t.toolName === 'Bash');
    expect(bash).toBeDefined();
    expect(bash.calls).toBe(10);
    expect(bash.successRate).toBeCloseTo(0.8, 5);
    // p50 of [10..100] is 55 (interpolated median of 10 items)
    expect(bash.p50Ms).toBeCloseTo(55, 1);
    // p95 of [10..100] with continuous interpolation in postgres:
    // percentile_cont(0.95): rank = 1 + 0.95 * 9 = 9.55 -> between 90 and 100 (95.5)
    expect(bash.p95Ms).toBeCloseTo(95.5, 1);

    const fileRead = body.tools.find((t: any) => t.toolName === 'FileRead');
    expect(fileRead).toBeDefined();
    expect(fileRead.calls).toBe(2);
    expect(fileRead.successRate).toBeCloseTo(1.0, 5);
    expect(fileRead.p50Ms).toBeCloseTo(10, 1);

    // Verify slowest list
    expect(body.slowest.length).toBeGreaterThan(0);
    expect(body.slowest[0].toolName).toBe('Bash');
    expect(body.slowest[0].durationMs).toBe(100);
    expect(body.slowest[0].sessionId).toBe('sess-tools-1');
  });
});
