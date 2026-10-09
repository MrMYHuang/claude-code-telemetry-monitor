import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { ingestRoutes } from './ingest/routes.js';

const gunzipAsync = promisify(zlib.gunzip);

export function buildApp(pool: Pool): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  // Remove default text/plain parser so unsupported content types stay 415
  app.removeContentTypeParser('text/plain');

  // Custom application/json parser supporting gzip decompression and charset
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 },
    async (request: FastifyRequest, payload: Buffer) => {
      let data = payload;
      const rawEncoding = request.headers['content-encoding'];
      const encoding = Array.isArray(rawEncoding) ? rawEncoding.join(',') : rawEncoding;

      if (
        typeof encoding === 'string' &&
        encoding.trim() !== '' &&
        encoding.toLowerCase() !== 'identity'
      ) {
        if (encoding.toLowerCase().includes('gzip')) {
          try {
            data = await gunzipAsync(payload);
          } catch {
            const error = new Error('Corrupt or invalid gzip payload');
            (error as any).statusCode = 400;
            throw error;
          }
        } else {
          const error = new Error(`Unsupported content encoding: ${encoding}`);
          (error as any).statusCode = 400;
          throw error;
        }
      }

      try {
        return JSON.parse(data.toString('utf-8'));
      } catch {
        const error = new Error('Invalid JSON payload');
        (error as any).statusCode = 400;
        throw error;
      }
    },
  );

  app.get('/healthz', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return reply.status(200).send({ status: 'ok' });
    } catch (err) {
      app.log.error(err, 'Health check failed');
      return reply.status(503).send({ status: 'error' });
    }
  });

  app.register(ingestRoutes, { pool });

  return app;
}

