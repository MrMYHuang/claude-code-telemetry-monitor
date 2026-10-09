import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { buildApp } from '../src/app.js';

describe('GET /healthz', () => {
  it('returns 200 { status: "ok" } when database query succeeds', async () => {
    const fakePool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
    } as unknown as Pool;

    const app = buildApp(fakePool);
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(fakePool.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns 503 when database query rejects', async () => {
    const fakePool = {
      query: vi.fn().mockRejectedValue(new Error('connection failed')),
    } as unknown as Pool;

    const app = buildApp(fakePool);
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(503);
  });
});
