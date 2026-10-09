import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { startTestDb } from '../helpers/db.js';

describe('Database schema and migrations', () => {
  let db: { pool: Pool; stop(): Promise<void> };

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    if (db) {
      await db.stop();
    }
  });

  it('creates tables metric_points, events, and view sessions', async () => {
    const tableRes = await db.pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('metric_points', 'events')
      ORDER BY table_name;
    `);

    const tableNames = tableRes.rows.map((r) => r.table_name);
    expect(tableNames).toContain('metric_points');
    expect(tableNames).toContain('events');

    const viewRes = await db.pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = 'sessions';
    `);

    expect(viewRes.rows.map((r) => r.table_name)).toContain('sessions');
  });

  it('enforces unique dedup_key on events with ON CONFLICT DO NOTHING idempotency', async () => {
    const dedupKey = 'dedup-test-key-1';

    const insertQuery = `
      INSERT INTO events (
        ts, event_name, session_id, dedup_key
      ) VALUES (
        $1, $2, $3, $4
      )
      ON CONFLICT (dedup_key) DO NOTHING;
    `;

    // First insert
    await db.pool.query(insertQuery, [
      new Date('2026-10-09T10:00:00Z'),
      'api_request',
      'sess-dedup',
      dedupKey,
    ]);

    // Second insert with same dedup_key
    await db.pool.query(insertQuery, [
      new Date('2026-10-09T10:00:00Z'),
      'api_request',
      'sess-dedup',
      dedupKey,
    ]);

    const countRes = await db.pool.query<{ count: number }>(`
      SELECT COUNT(*)::int AS count
      FROM events
      WHERE dedup_key = $1;
    `, [dedupKey]);

    expect(countRes.rows[0].count).toBe(1);
  });

  it('aggregates total_cost, tool_calls, and errors for 3 events in sessions view', async () => {
    const sessionId = 'sess-agg-test';

    // Event 1: api_request with cost and tokens
    await db.pool.query(`
      INSERT INTO events (
        ts, event_name, session_id, cost_usd, input_tokens, output_tokens, dedup_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7);
    `, [
      new Date('2026-10-09T10:00:00Z'),
      'api_request',
      sessionId,
      0.012,
      100,
      50,
      'agg-key-1',
    ]);

    // Event 2: successful tool_result
    await db.pool.query(`
      INSERT INTO events (
        ts, event_name, session_id, tool_name, success, dedup_key
      ) VALUES ($1, $2, $3, $4, $5, $6);
    `, [
      new Date('2026-10-09T10:01:00Z'),
      'tool_result',
      sessionId,
      'ReadFile',
      true,
      'agg-key-2',
    ]);

    // Event 3: failed tool_result (success = false)
    await db.pool.query(`
      INSERT INTO events (
        ts, event_name, session_id, tool_name, success, cost_usd, error, dedup_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `, [
      new Date('2026-10-09T10:02:00Z'),
      'tool_result',
      sessionId,
      'Bash',
      false,
      0.003,
      'command failed',
      'agg-key-3',
    ]);

    const res = await db.pool.query<{
      session_id: string;
      started_at: Date;
      last_seen: Date;
      total_cost: number;
      total_tokens: number;
      tool_calls: number;
      errors: number;
    }>(`
      SELECT *
      FROM sessions
      WHERE session_id = $1;
    `, [sessionId]);

    expect(res.rows).toHaveLength(1);
    const session = res.rows[0];

    expect(session.session_id).toBe(sessionId);
    expect(new Date(session.started_at).toISOString()).toBe('2026-10-09T10:00:00.000Z');
    expect(new Date(session.last_seen).toISOString()).toBe('2026-10-09T10:02:00.000Z');
    expect(Number(session.total_cost)).toBeCloseTo(0.015, 4);
    expect(Number(session.total_tokens)).toBe(150);
    expect(Number(session.tool_calls)).toBe(2);
    expect(Number(session.errors)).toBe(1);
  });

  it('counts api_error in errors in sessions view', async () => {
    const sessionId = 'sess-error-test';

    await db.pool.query(`
      INSERT INTO events (
        ts, event_name, session_id, error, dedup_key
      ) VALUES ($1, $2, $3, $4, $5);
    `, [
      new Date('2026-10-09T11:00:00Z'),
      'api_error',
      sessionId,
      'rate limit exceeded',
      'err-key-1',
    ]);

    const res = await db.pool.query<{
      session_id: string;
      tool_calls: number;
      errors: number;
    }>(`
      SELECT *
      FROM sessions
      WHERE session_id = $1;
    `, [sessionId]);

    expect(res.rows).toHaveLength(1);
    expect(Number(res.rows[0].tool_calls)).toBe(0);
    expect(Number(res.rows[0].errors)).toBe(1);
  });
});
