import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Pool } from 'pg';

describe('Fastify Static and SPA serving', () => {
  const fakePool = {
    query: async () => ({ rows: [{ ok: 1 }] }),
  } as unknown as Pool;

  const app = buildApp(fakePool);

  it('serves index.html at root GET /', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<div id="root"></div>');
  });

  it('serves index.html for SPA routes (GET /sessions, GET /tools, GET /errors)', async () => {
    const sessionsRes = await app.inject({
      method: 'GET',
      url: '/sessions',
    });
    expect(sessionsRes.statusCode).toBe(200);
    expect(sessionsRes.headers['content-type']).toContain('text/html');
    expect(sessionsRes.body).toContain('<div id="root"></div>');

    const toolsRes = await app.inject({
      method: 'GET',
      url: '/tools',
    });
    expect(toolsRes.statusCode).toBe(200);
    expect(toolsRes.headers['content-type']).toContain('text/html');

    const errorsRes = await app.inject({
      method: 'GET',
      url: '/errors',
    });
    expect(errorsRes.statusCode).toBe(200);
    expect(errorsRes.headers['content-type']).toContain('text/html');

    const sessionDetailRes = await app.inject({
      method: 'GET',
      url: '/sessions/session-xyz-123',
    });
    expect(sessionDetailRes.statusCode).toBe(200);
    expect(sessionDetailRes.headers['content-type']).toContain('text/html');
  });

  it('does not shadow /healthz', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('does not shadow /api routes', async () => {
    // GET /api/overview returns 200 with totals, not index.html
    const res = await app.inject({
      method: 'GET',
      url: '/api/overview',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('totals');
    expect(res.headers['content-type']).toContain('application/json');

    // Invalid query param returns 400 validation error
    const invalidRes = await app.inject({
      method: 'GET',
      url: '/api/overview?bucket=invalid',
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.json()).toHaveProperty('error');

    // Unknown /api route returns 404 JSON, not index.html
    const missingApiRes = await app.inject({
      method: 'GET',
      url: '/api/unknown-endpoint',
    });
    expect(missingApiRes.statusCode).toBe(404);
    expect(missingApiRes.json()).toEqual({ error: 'Not found' });
  });

  it('does not shadow /v1 routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/unknown',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 404 for non-GET requests to SPA routes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sessions',
    });
    expect(res.statusCode).toBe(404);
  });
});
