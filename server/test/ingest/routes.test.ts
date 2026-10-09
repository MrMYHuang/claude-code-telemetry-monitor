import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';
import type { Pool } from 'pg';
import { startTestDb } from '../helpers/db.js';
import { buildApp } from '../../src/app.js';
import { insertEvents, insertMetricPoints } from '../../src/ingest/store.js';
import { parseLogs, type EventRow } from '../../src/ingest/logs.js';
import { parseMetrics, type MetricRow } from '../../src/ingest/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logsFixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/logs.json'), 'utf-8'),
);

const metricsFixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/metrics.json'), 'utf-8'),
);

describe('Ingest storage and HTTP routes', () => {
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

  describe('POST /v1/logs', () => {
    it('(a) POST logs fixture -> 200 body {} and rows in events', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(logsFixture),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});

      const expectedRows = parseLogs(logsFixture);
      expect(expectedRows.length).toBeGreaterThan(0);

      const dbRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM events;',
      );
      expect(dbRes.rows[0].count).toBe(expectedRows.length);

      const eventsRes = await db.pool.query<{
        event_name: string;
        session_id: string;
        cost_usd: number | null;
        input_tokens: number | null;
      }>("SELECT event_name, session_id, cost_usd, input_tokens FROM events WHERE event_name = 'api_request';");
      expect(eventsRes.rows[0].event_name).toBe('api_request');
      expect(eventsRes.rows[0].session_id).toBe('sess-001');
      expect(eventsRes.rows[0].cost_usd).toBe(0.012);
      expect(eventsRes.rows[0].input_tokens).toBe(100);
    });

    it('(b) POST same payload twice -> row count unchanged', async () => {
      // First submission
      const res1 = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(logsFixture),
      });
      expect(res1.statusCode).toBe(200);

      const dbRes1 = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM events;',
      );
      const initialCount = dbRes1.rows[0].count;
      expect(initialCount).toBeGreaterThan(0);

      // Redelivered submission
      const res2 = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(logsFixture),
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json()).toEqual({});

      const dbRes2 = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM events;',
      );
      expect(dbRes2.rows[0].count).toBe(initialCount);
    });

    it('(c) gzip-encoded body accepted', async () => {
      const gzippedBody = zlib.gzipSync(Buffer.from(JSON.stringify(logsFixture)));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
        },
        body: gzippedBody,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});

      const dbRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM events;',
      );
      expect(dbRes.rows[0].count).toBe(parseLogs(logsFixture).length);
    });

    it('(d) invalid JSON body -> 400', async () => {
      // Malformed raw JSON string
      const resMalformed = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/json',
        },
        body: '{"unclosed": json',
      });
      expect(resMalformed.statusCode).toBe(400);
      expect(resMalformed.json()).toHaveProperty('error');

      // Corrupt gzip body
      const resCorruptGzip = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
        },
        body: Buffer.from('not really a gzipped stream'),
      });
      expect(resCorruptGzip.statusCode).toBe(400);
      expect(resCorruptGzip.json()).toHaveProperty('error');
    });

    it('(e) {} payload -> 200, zero rows', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/json',
        },
        body: '{}',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});

      const dbRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM events;',
      );
      expect(dbRes.rows[0].count).toBe(0);
    });

    it('(f) app built with a pool whose query rejects -> 503', async () => {
      const rejectingPool = {
        query: vi.fn().mockRejectedValue(new Error('db connection lost')),
      } as unknown as Pool;

      const brokenApp = buildApp(rejectingPool);
      try {
        const response = await brokenApp.inject({
          method: 'POST',
          url: '/v1/logs',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(logsFixture),
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toHaveProperty('error');
      } finally {
        await brokenApp.close();
      }
    });

    it('tolerates Content-Type with charset utf-8', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(logsFixture),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});
    });

    it('rejects unsupported content types with 415', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/xml',
        },
        body: '<xml></xml>',
      });

      expect(response.statusCode).toBe(415);
    });

    it('handles empty resourceLogs with 200 and zero rows', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/logs',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ resourceLogs: [] }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});

      const dbRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM events;',
      );
      expect(dbRes.rows[0].count).toBe(0);
    });
  });

  describe('POST /v1/metrics', () => {
    it('(g) POST metrics fixture -> rows in metric_points', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/metrics',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(metricsFixture),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});

      const expectedRows = parseMetrics(metricsFixture);
      expect(expectedRows.length).toBeGreaterThan(0);

      const dbRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM metric_points;',
      );
      expect(dbRes.rows[0].count).toBe(expectedRows.length);

      const pointsRes = await db.pool.query<{
        name: string;
        value: number;
        token_type: string | null;
      }>('SELECT name, value, token_type FROM metric_points ORDER BY ts ASC;');
      expect(pointsRes.rows[0].name).toBe('claude_code.token.usage');
      expect(pointsRes.rows[0].value).toBe(42);
      expect(pointsRes.rows[0].token_type).toBe('input');
    });

    it('POST metrics with gzip encoding accepted', async () => {
      const gzippedBody = zlib.gzipSync(Buffer.from(JSON.stringify(metricsFixture)));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/metrics',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
        },
        body: gzippedBody,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});

      const dbRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM metric_points;',
      );
      expect(dbRes.rows[0].count).toBe(parseMetrics(metricsFixture).length);
    });

    it('{} payload -> 200, zero rows', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/metrics',
        headers: {
          'content-type': 'application/json',
        },
        body: '{}',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});

      const dbRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM metric_points;',
      );
      expect(dbRes.rows[0].count).toBe(0);
    });

    it('malformed JSON body -> 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/metrics',
        headers: {
          'content-type': 'application/json',
        },
        body: 'invalid-json-body',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('app built with a pool whose query rejects -> 503', async () => {
      const rejectingPool = {
        query: vi.fn().mockRejectedValue(new Error('db connection lost')),
      } as unknown as Pool;

      const brokenApp = buildApp(rejectingPool);
      try {
        const response = await brokenApp.inject({
          method: 'POST',
          url: '/v1/metrics',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(metricsFixture),
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toHaveProperty('error');
      } finally {
        await brokenApp.close();
      }
    });

    it('handles empty resourceMetrics with 200 and zero rows', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/metrics',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ resourceMetrics: [] }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({});

      const dbRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM metric_points;',
      );
      expect(dbRes.rows[0].count).toBe(0);
    });
  });

  describe('Store unit tests (insertEvents / insertMetricPoints)', () => {
    it('returns 0 immediately when rows array is empty', async () => {
      const querySpy = vi.spyOn(db.pool, 'query');
      const eventsInserted = await insertEvents(db.pool, []);
      const metricsInserted = await insertMetricPoints(db.pool, []);

      expect(eventsInserted).toBe(0);
      expect(metricsInserted).toBe(0);
      expect(querySpy).not.toHaveBeenCalled();
      querySpy.mockRestore();
    });

    it('handles batches larger than 500 rows across multiple chunks', async () => {
      const manyEvents: EventRow[] = [];
      const now = new Date('2026-10-09T12:00:00Z');

      for (let i = 0; i < 1050; i++) {
        manyEvents.push({
          ts: new Date(now.getTime() + i * 1000),
          eventName: 'api_request',
          sessionId: `sess-batch-${i}`,
          promptId: null,
          model: 'claude-3-5-sonnet',
          toolName: null,
          durationMs: 100 + i,
          success: true,
          costUsd: 0.001,
          inputTokens: 10,
          outputTokens: 20,
          error: null,
          attributes: { batch_index: i },
          dedupKey: `dedup-batch-${i}`,
        });
      }

      const inserted = await insertEvents(db.pool, manyEvents);
      expect(inserted).toBe(1050);

      const countRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM events;',
      );
      expect(countRes.rows[0].count).toBe(1050);

      // Same 1050 rows inserted again -> 0 new rows inserted
      const reinserted = await insertEvents(db.pool, manyEvents);
      expect(reinserted).toBe(0);

      // Large batch for metric_points
      const manyMetrics: MetricRow[] = [];
      for (let i = 0; i < 1050; i++) {
        manyMetrics.push({
          ts: new Date(now.getTime() + i * 1000),
          name: 'claude_code.token.usage',
          value: i,
          sessionId: `sess-batch-${i}`,
          model: 'claude-3-5-sonnet',
          tokenType: 'input',
          attributes: { index: i },
        });
      }

      const metricsInserted = await insertMetricPoints(db.pool, manyMetrics);
      expect(metricsInserted).toBe(1050);

      const metricsCountRes = await db.pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM metric_points;',
      );
      expect(metricsCountRes.rows[0].count).toBe(1050);
    });
  });
});
