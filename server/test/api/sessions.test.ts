import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { startTestDb } from '../helpers/db.js';
import { buildApp } from '../../src/app.js';
import { insertEvents } from '../../src/ingest/store.js';

describe('Sessions API (/api/sessions)', () => {
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

  describe('GET /api/sessions', () => {
    it('returns empty list and total 0 on empty database', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        items: [],
        total: 0,
      });
    });

    it('returns 400 on invalid pagination/from query parameter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions?limit=-5',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty('error');
    });

    it('supports ordering and pagination', async () => {
      const events = [
        // sess-1: last_seen 10:30
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
          dedupKey: 'k-2',
        },
        // sess-2: last_seen 12:00 (most recent)
        {
          ts: new Date('2026-10-09T12:00:00.000Z'),
          eventName: 'api_request',
          sessionId: 'sess-2',
          promptId: null,
          model: 'claude-3-5-sonnet',
          toolName: null,
          durationMs: 300,
          success: true,
          costUsd: 0.02,
          inputTokens: 40,
          outputTokens: 20,
          error: null,
          attributes: {},
          dedupKey: 'k-3',
        },
        // sess-3: last_seen 09:00 (oldest)
        {
          ts: new Date('2026-10-09T09:00:00.000Z'),
          eventName: 'api_request',
          sessionId: 'sess-3',
          promptId: null,
          model: 'claude-3-haiku',
          toolName: null,
          durationMs: 150,
          success: true,
          costUsd: 0.01,
          inputTokens: 20,
          outputTokens: 10,
          error: null,
          attributes: {},
          dedupKey: 'k-4',
        },
      ];

      await insertEvents(db.pool, events);

      // Page 1: limit 2
      const page1 = await app.inject({
        method: 'GET',
        url: '/api/sessions?limit=2&offset=0',
      });

      expect(page1.statusCode).toBe(200);
      const body1 = page1.json();
      expect(body1.total).toBe(3);
      expect(body1.items).toHaveLength(2);
      expect(body1.items[0].sessionId ?? body1.items[0].session_id).toBe('sess-2');
      expect(body1.items[1].sessionId ?? body1.items[1].session_id).toBe('sess-1');

      // Page 2: limit 2, offset 2
      const page2 = await app.inject({
        method: 'GET',
        url: '/api/sessions?limit=2&offset=2',
      });

      expect(page2.statusCode).toBe(200);
      const body2 = page2.json();
      expect(body2.total).toBe(3);
      expect(body2.items).toHaveLength(1);
      expect(body2.items[0].sessionId ?? body2.items[0].session_id).toBe('sess-3');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('returns 404 with { error: "Session not found" } for unknown session', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/unknown-sess-999',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Session not found' });
    });

    it('returns session details and events ordered by ts ASC', async () => {
      const sessionId = 'sess-detailed-1';
      const events = [
        {
          ts: new Date('2026-10-09T10:10:00.000Z'),
          eventName: 'tool_result',
          sessionId,
          promptId: null,
          model: null,
          toolName: 'Bash',
          durationMs: 45,
          success: true,
          costUsd: null,
          inputTokens: null,
          outputTokens: null,
          error: null,
          attributes: {},
          dedupKey: 'k-10',
        },
        {
          ts: new Date('2026-10-09T10:00:00.000Z'),
          eventName: 'api_request',
          sessionId,
          promptId: 'p-1',
          model: 'claude-3-5-sonnet',
          toolName: null,
          durationMs: 500,
          success: true,
          costUsd: 0.05,
          inputTokens: 100,
          outputTokens: 50,
          error: null,
          attributes: {},
          dedupKey: 'k-11',
        },
        {
          ts: new Date('2026-10-09T10:20:00.000Z'),
          eventName: 'api_error',
          sessionId,
          promptId: 'p-1',
          model: 'claude-3-5-sonnet',
          toolName: null,
          durationMs: 100,
          success: false,
          costUsd: null,
          inputTokens: null,
          outputTokens: null,
          error: 'Rate limit reached',
          attributes: {},
          dedupKey: 'k-12',
        },
      ];

      await insertEvents(db.pool, events);

      const res = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionId}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('session');
      expect(body).toHaveProperty('events');

      const s = body.session;
      expect(s.sessionId ?? s.session_id).toBe(sessionId);
      expect(s.totalCost ?? s.total_cost).toBeCloseTo(0.05, 5);
      expect(s.totalTokens ?? s.total_tokens).toBe(150);
      expect(s.toolCalls ?? s.tool_calls).toBe(1);
      expect(s.errors).toBe(1);

      // Verify events ordered by ts ASC
      expect(body.events).toHaveLength(3);
      expect(body.events[0].ts).toBe('2026-10-09T10:00:00.000Z');
      expect(body.events[1].ts).toBe('2026-10-09T10:10:00.000Z');
      expect(body.events[2].ts).toBe('2026-10-09T10:20:00.000Z');
    });
  });
});
