import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { startTestDb } from '../helpers/db.js';
import { buildApp } from '../../src/app.js';
import { insertEvents } from '../../src/ingest/store.js';

describe('Errors API (GET /api/errors)', () => {
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

  it('returns empty list and total 0 on empty database', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/errors',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [],
      total: 0,
    });
  });

  it('returns 400 on invalid query parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/errors?to=invalid-date',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error');
  });

  it('includes both api_error events and failed tool_result events with pagination', async () => {
    const events = [
      // 1. api_error event
      {
        ts: new Date('2026-10-09T10:00:00.000Z'),
        eventName: 'api_error',
        sessionId: 'sess-err-1',
        promptId: null,
        model: 'claude-3-5-sonnet',
        toolName: null,
        durationMs: 150,
        success: false,
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        error: 'Rate limit exceeded: 429',
        attributes: {},
        dedupKey: 'err-1',
      },
      // 2. tool_result with success = false
      {
        ts: new Date('2026-10-09T10:15:00.000Z'),
        eventName: 'tool_result',
        sessionId: 'sess-err-1',
        promptId: null,
        model: null,
        toolName: 'Bash',
        durationMs: 80,
        success: false,
        costUsd: null,
        inputTokens: null,
        outputTokens: null,
        error: 'npm test failed with exit code 1',
        attributes: {},
        dedupKey: 'err-2',
      },
      // 3. tool_result with success = true (should NOT be included)
      {
        ts: new Date('2026-10-09T10:20:00.000Z'),
        eventName: 'tool_result',
        sessionId: 'sess-err-1',
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
        dedupKey: 'ok-1',
      },
      // 4. normal api_request (should NOT be included)
      {
        ts: new Date('2026-10-09T10:30:00.000Z'),
        eventName: 'api_request',
        sessionId: 'sess-err-2',
        promptId: null,
        model: 'claude-3-haiku',
        toolName: null,
        durationMs: 300,
        success: true,
        costUsd: 0.01,
        inputTokens: 10,
        outputTokens: 5,
        error: null,
        attributes: {},
        dedupKey: 'ok-2',
      },
    ];

    await insertEvents(db.pool, events);

    // Fetch all errors
    const res = await app.inject({
      method: 'GET',
      url: '/api/errors',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);

    // Ordered by ts DESC: tool_result (10:15) then api_error (10:00)
    expect(body.items[0]).toEqual({
      ts: '2026-10-09T10:15:00.000Z',
      kind: 'tool_error',
      message: 'npm test failed with exit code 1',
      model: null,
      sessionId: 'sess-err-1',
    });

    expect(body.items[1]).toEqual({
      ts: '2026-10-09T10:00:00.000Z',
      kind: 'api_error',
      message: 'Rate limit exceeded: 429',
      model: 'claude-3-5-sonnet',
      sessionId: 'sess-err-1',
    });

    // Test pagination
    const p1 = await app.inject({
      method: 'GET',
      url: '/api/errors?limit=1&offset=0',
    });
    expect(p1.statusCode).toBe(200);
    const b1 = p1.json();
    expect(b1.total).toBe(2);
    expect(b1.items).toHaveLength(1);
    expect(b1.items[0].kind).toBe('tool_error');

    const p2 = await app.inject({
      method: 'GET',
      url: '/api/errors?limit=1&offset=1',
    });
    expect(p2.statusCode).toBe(200);
    const b2 = p2.json();
    expect(b2.total).toBe(2);
    expect(b2.items).toHaveLength(1);
    expect(b2.items[0].kind).toBe('api_error');
  });
});
